import AppKit
import CoreGraphics
import Foundation

/// Counts seconds per app while a session is running, and asks the UI to get
/// in the way when Focus Mode says so.
///
/// The rules come from the extension's background worker, by way of the
/// Windows app:
///
///   - Nothing is recorded when no session is running. Not recorded and then
///     discarded — the timer simply does not accumulate.
///   - App names only, never window titles. On a Mac that is enforced by the
///     system rather than by restraint: reading another app's window titles
///     needs Accessibility permission, and this app never asks for it. If it
///     wanted to break that promise, macOS would make the student approve it
///     in System Settings first.
///   - No encryption key here, ever. What this posts lands in a staging table
///     the server can read, and the student's browser encrypts and deletes it
///     on next load.
///   - Elapsed time is measured against a stored timestamp rather than counted
///     by a ticker, so a sleeping laptop neither invents nor loses minutes.
@MainActor
final class Tracker {

    /// How long without keyboard or mouse before we assume they walked away.
    /// Long enough to read a page without being marked absent; short enough
    /// that lunch doesn't count as revision.
    private static let idleThreshold: TimeInterval = 10 * 60

    /// A slice longer than this is a bug or a suspended machine, and either
    /// way it is not study time.
    private static let maxSlice: TimeInterval = 6 * 60 * 60

    /// Re-focusing a blocked app shouldn't file a fresh block event every
    /// second — that would fill the batch with identical rows and push out the
    /// real ones.
    private static let blockCooldown: TimeInterval = 30

    /// Activity is batched every minute, but session state is asked for four
    /// times as often. Focus Mode is switched on at the website, and a student
    /// who flips it and then watches nothing happen for a minute concludes the
    /// app is broken — which, from where they're standing, it is.
    private static let flushEverySeconds = 60
    private static let pollEverySeconds = 15

    /// The endpoint accepts 200 entries. Sending more loses the whole batch.
    private static let maxDomainsPerFlush = 200

    private let config: Config
    private let api = ApiClient()

    private var timer: Timer?
    private var tally: [String: Int] = [:]
    private var blocked: [BlockEvent] = []
    private var lastBlockAt: [String: Date] = [:]

    /// Apps the student overrode. Cleared when the session ends, because an
    /// override is a decision about this study session and not a permanent
    /// hole in their blocklist.
    private var allowed: Set<String> = []

    private var currentApp: String?
    private var currentSince = Date()
    private var secondsSinceFlush = 0
    private var secondsSincePoll = 0
    private var flushInFlight = false

    /// Where a blocked app lives, so an override can start it again. Quitting
    /// something and then having no way to give it back would be worse than
    /// not blocking it at all.
    private var blockedAppURLs: [String: URL] = [:]

    private(set) var session: SessionState?
    private(set) var blocklist: [String] = []
    private(set) var lastError: String?

    var paired: Bool { config.paired }

    /// Called whenever the menu bar's answer to "am I connected, am I
    /// recording" might have changed.
    var onChange: (() -> Void)?

    /// Called when a blocked app was hidden and the student should be told
    /// why.
    var onBlockRequested: ((String) -> Void)?

    init(config: Config) {
        self.config = config
        observeMachineState()
    }

    func start() {
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        // Common mode, so holding a menu open doesn't pause the clock.
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer

        syncNow()
    }

    // --- pairing ------------------------------------------------------------

    /// Try a code before it is saved, so a mistyped one fails on the pairing
    /// screen rather than looking connected and silently never recording.
    func verify(base: String, token: String) async -> PollResult {
        await api.poll(base: base, token: token)
    }

    func applyPairing(base: String, token: String, result: PollResult) {
        config.apiBase = base
        config.token = token
        config.save()

        session = result.session
        blocklist = result.blocklist
        lastError = nil
        onChange?()
    }

    /// Unpairing leaves nothing behind — including whatever was counted and
    /// not yet sent.
    func unpair() {
        config.clear()
        session = nil
        blocklist = []
        tally = [:]
        blocked = []
        allowed = []
        currentApp = nil
        lastError = nil
        onChange?()
    }

    // --- time accounting ----------------------------------------------------

    /// Close out the app currently in front and add its seconds to the tally.
    ///
    /// `endAt` is not always now: time spent idle ended the slice at the last
    /// keypress, not at the moment we noticed.
    private func closeSlice(endAt: Date? = nil) {
        guard session != nil, let app = currentApp else { return }

        let end = max(endAt ?? Date(), currentSince)
        let elapsed = end.timeIntervalSince(currentSince)

        if elapsed > 0 && elapsed < Tracker.maxSlice {
            let seconds = Int(elapsed)
            if seconds > 0 { tally[app, default: 0] += seconds }
        }

        currentApp = nil
    }

    /// Seconds since the keyboard or mouse was last touched.
    private func idleSeconds() -> TimeInterval {
        guard let any = CGEventType(rawValue: ~0) else { return 0 }
        return CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: any)
    }

    private func tick() {
        // No session, no recording. This is the promise the privacy page makes
        // and the reason this check is the first thing here.
        if session == nil {
            currentApp = nil
        } else {
            let idle = idleSeconds()
            if idle >= Tracker.idleThreshold {
                closeSlice(endAt: Date().addingTimeInterval(-idle))
            } else {
                observe()
            }
        }

        secondsSinceFlush += 1
        secondsSincePoll += 1

        if secondsSinceFlush >= Tracker.flushEverySeconds {
            secondsSinceFlush = 0
            secondsSincePoll = 0
            syncNow()
        } else if secondsSincePoll >= Tracker.pollEverySeconds {
            secondsSincePoll = 0
            syncNow(sending: false)
        }
    }

    private func observe() {
        guard let running = NSWorkspace.shared.frontmostApplication else {
            closeSlice()
            return
        }

        guard let app = Apps.report(
            bundleId: running.bundleIdentifier,
            name: running.localizedName)
        else {
            closeSlice()
            return
        }

        if app == currentApp { return }

        closeSlice()

        if session?.focusMode == true,
           !allowed.contains(app),
           Apps.isBlocked(app, blocklist: blocklist) {
            enforce(app, running: running)
            return
        }

        currentApp = app
        currentSince = Date()
    }

    /// Get a blocked app out of the way, and say why.
    ///
    /// Quit, not hidden. Hiding was the first attempt and it is toothless —
    /// one Cmd-Tab and you're back where you were, which makes Focus Mode a
    /// suggestion rather than a decision.
    ///
    /// `terminate()` is the polite quit, the same one Cmd-Q sends: an app with
    /// unsaved work still puts up its save dialog and still wins the argument.
    /// Nothing is destroyed silently, which is the line worth holding — the
    /// point is to make going back deliberate, not to punish. Where the app
    /// refuses outright, hiding is the fallback so something still happens.
    private func enforce(_ app: String, running: NSRunningApplication) {
        let now = Date()
        if let last = lastBlockAt[app], now.timeIntervalSince(last) < Tracker.blockCooldown {
            // Already handled a moment ago. Still don't count the time.
            return
        }
        lastBlockAt[app] = now

        if let url = running.bundleURL { blockedAppURLs[app] = url }

        if !running.terminate() {
            running.hide()
        }

        blocked.append(BlockEvent(site: app, overrideUsed: false))
        onBlockRequested?(app)
    }

    /// The student decided to go ahead anyway.
    ///
    /// Recorded before it takes effect, so the session's distraction figures
    /// reflect what actually happened, and allowed for the rest of the session
    /// so they aren't fought with every thirty seconds.
    func recordOverride(_ app: String) {
        allowed.insert(app)
        blocked.append(BlockEvent(site: app, overrideUsed: true))
        syncNow()

        // Start it again, since we quit it. An override that left the student
        // to go and find the app themselves would be a worse experience than
        // the block.
        if let url = blockedAppURLs[app] {
            NSWorkspace.shared.openApplication(
                at: url,
                configuration: NSWorkspace.OpenConfiguration())
        }
    }

    // --- sync ---------------------------------------------------------------

    func pollNow() { syncNow() }

    private func syncNow(sending: Bool = true) {
        guard !flushInFlight else { return }
        flushInFlight = true

        Task { @MainActor in
            await sync(sending: sending)
            flushInFlight = false
        }
    }

    private func sync(sending: Bool) async {
        guard config.paired else { return }

        if sending {
            // Roll the open slice into the tally first, so an app left in
            // front for an hour reports steadily rather than all at once when
            // they finally switch away.
            let open = currentApp
            closeSlice()

            await flush()

            if let open, session != nil {
                currentApp = open
                currentSince = Date()
            }
        }

        await poll()
    }

    private func poll() async {
        let result = await api.poll(base: config.apiBase, token: config.token)

        switch result.status {
        case .unauthorised:
            // Revoked, or the wrong code. Say so plainly rather than failing
            // silently and looking like the app simply stopped.
            session = nil
            currentApp = nil
            lastError = "This device was unpaired. Pair it again from Insight."
            onChange?()
            return
        case .unreachable:
            lastError = "Can't reach Insight. Retrying."
            onChange?()
            return
        case .ok:
            break
        }

        let previous = session
        session = result.session
        blocklist = result.blocklist
        lastError = nil

        // The session ended, or a different one started. Either way the tally
        // belongs to the old id, and posting it after that id stops being
        // current loses the last minute of every session.
        if let previous, previous.id != result.session?.id {
            closeSlice()
            await flush(sessionIdOverride: previous.id)
            allowed = []
            lastBlockAt = [:]
        }

        onChange?()
    }

    /// Send the tally and clear it.
    ///
    /// The tally is taken out of the field before the request and put back on
    /// failure, so a dropped connection delays the data rather than destroying
    /// it, and seconds counted while the request was in flight aren't lost to
    /// a blind clear.
    private func flush(sessionIdOverride: String? = nil) async {
        guard config.paired, let sessionId = sessionIdOverride ?? session?.id else { return }
        guard !tally.isEmpty || !blocked.isEmpty else { return }

        let sentTally = tally
        let sentBlocked = blocked
        tally = [:]
        blocked = []

        let domains = sentTally
            .filter { $0.value > 0 }
            .sorted { $0.value > $1.value }
            .prefix(Tracker.maxDomainsPerFlush)
            .map { DomainTime(domain: $0.key, seconds: min($0.value, 86_400)) }

        let events = Array(sentBlocked.prefix(Tracker.maxDomainsPerFlush))
        guard !domains.isEmpty || !events.isEmpty else { return }

        let ok = await api.postActivity(
            base: config.apiBase,
            token: config.token,
            sessionId: sessionId,
            domains: Array(domains),
            blocked: events)

        guard !ok else { return }

        // Put it back, merging with anything counted meanwhile.
        for (key, value) in sentTally { tally[key, default: 0] += value }
        blocked.insert(contentsOf: sentBlocked, at: 0)
    }

    /// Last chance to send what's counted, on quit.
    func flushBeforeExit() async {
        timer?.invalidate()
        timer = nil

        guard config.paired, session != nil else { return }
        closeSlice()
        await flush()
    }

    // --- machine state ------------------------------------------------------

    private func observeMachineState() {
        let center = NSWorkspace.shared.notificationCenter

        // React the moment they switch apps rather than up to a second later
        // on the next tick. The timer stays as the backstop for everything
        // this notification doesn't cover — idleness, and an app that was
        // already in front when a session started.
        center.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.session != nil else { return }
                self.observe()
            }
        }

        // Sleeping, locking the screen and switching user are all "left the
        // desk". The clock stops for each.
        for name in [
            NSWorkspace.willSleepNotification,
            NSWorkspace.screensDidSleepNotification,
            NSWorkspace.sessionDidResignActiveNotification,
        ] {
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.closeSlice() }
            }
        }

        center.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                // The lid was shut for an unknown length of time; whatever the
                // clock says about the app still in front, it wasn't in use.
                self?.currentApp = nil
                self?.pollNow()
            }
        }
    }
}
