import CryptoKit
import Foundation
import SwiftUI

/// What the phone knows, and what it can do about it.
///
/// The website still owns most of this — the blocklist, the settings, the
/// insights engine. The phone follows, and adds the two things it is genuinely
/// better at: starting a session from the thing already in your hand, and
/// logging a night's sleep before you've got out of bed.
@MainActor
final class Store: ObservableObject {
    enum Phase {
        case unpaired
        /// Paired, but the key isn't in memory. Closing the app locks it
        /// again, the same bargain the browser makes.
        case locked
        case ready
    }

    @Published private(set) var phase: Phase
    @Published private(set) var session: SessionState?
    @Published private(set) var lastError: String?
    @Published private(set) var busy = false
    /// Set when a Shortcuts automation opened us with `insight://bounce`.
    ///
    /// Carries a timestamp so a second bounce off the same app re-triggers the
    /// screen rather than looking like nothing happened — the interruption is
    /// the entire feature.
    @Published private(set) var bouncedFrom: Bounce?

    struct Bounce: Equatable {
        let app: String?
        let at: Date
    }

    @Published var useFocusShortcuts: Bool {
        didSet {
            config.useFocusShortcuts = useFocusShortcuts
            config.save()
        }
    }

    private let config = Config()
    private let api = ApiClient()
    private var key: SymmetricKey?
    private var timer: Timer?

    /// Fifteen seconds, matching the desktop apps.
    private static let pollSeconds: TimeInterval = 15

    init() {
        phase = config.paired ? .locked : .unpaired
        useFocusShortcuts = config.useFocusShortcuts
    }

    private var phone: PhoneApi { PhoneApi(base: config.apiBase, token: config.token) }

    func start() {
        guard timer == nil else { return }

        let timer = Timer(timeInterval: Store.pollSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer

        Task { await refresh() }
    }

    /// `insight://bounce?app=Instagram`.
    ///
    /// The app name is checked here rather than trusted: it arrives from a URL,
    /// which anything on the phone can construct, and it gets rendered straight
    /// back to the reader. Same rule as `src/lib/bounce.ts` on the web.
    func handle(url: URL) {
        guard url.scheme == "insight", url.host == "bounce" else { return }

        let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "app" })?.value

        bouncedFrom = Bounce(app: Store.cleanAppName(raw), at: Date())
    }

    func dismissBounce() {
        bouncedFrom = nil
    }

    /// Letters, digits, spaces and the marks real app names use. Anything else
    /// and we say nothing rather than showing someone else's sentence.
    static func cleanAppName(_ input: String?) -> String? {
        guard let input else { return nil }

        let collapsed = input
            .replacingOccurrences(of: " +", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)

        guard !collapsed.isEmpty, collapsed.count <= 40 else { return nil }
        guard collapsed.rangeOfCharacter(from: .controlCharacters) == nil else { return nil }
        guard collapsed.rangeOfCharacter(from: CharacterSet(charactersIn: ":/\\<>")) == nil
        else { return nil }

        let allowed = CharacterSet.letters
            .union(.decimalDigits)
            .union(CharacterSet(charactersIn: " '&+.!-"))
        guard collapsed.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }

        return collapsed
    }

    // --- pairing and unlocking ----------------------------------------------

    /// The code carries the address, the token and the encryption setup —
    /// see `src/lib/pairing.ts` for why it isn't an endpoint.
    func pair(code: String) async -> String? {
        guard let pairing = Pairing.decode(code) else {
            return "That code didn't scan right. Copy the whole thing — it's long."
        }
        if let problem = Address.problem(with: pairing.base) { return problem }

        // Checked against the server before it's kept, so a stale code fails
        // here rather than looking connected and never working.
        let result = await api.poll(base: pairing.base, token: pairing.token)
        switch result.status {
        case .unauthorised:
            return "That code has been revoked. Generate a new one on the website."
        case .unreachable:
            return "Couldn't reach \(pairing.base). Check your connection."
        case .ok:
            config.apiBase = pairing.base
            config.token = pairing.token
            config.setup = pairing.setup
            config.save()

            session = result.session
            phase = .locked
            return nil
        }
    }

    /// Deriving the key takes about a second by design, so it happens off the
    /// main thread. Doing it inline freezes the screen just long enough that
    /// the button looks broken and gets tapped again.
    func unlock(password: String) async -> String? {
        guard let setup = config.setup else { return "This phone isn't paired." }

        do {
            key = try await Task.detached(priority: .userInitiated) {
                try Crypto.unlock(password: password, setup: setup)
            }.value

            phase = .ready
            await refresh()
            return nil
        } catch Crypto.Failure.wrongPassword {
            return "That password doesn't match."
        } catch {
            return "Couldn't unlock. Pair this phone again."
        }
    }

    func lock() {
        key = nil
        phase = config.paired ? .locked : .unpaired
    }

    func unpair() {
        config.clear()
        key = nil
        session = nil
        lastError = nil
        phase = .unpaired
    }

    // --- what the phone can do ----------------------------------------------

    func refresh() async {
        guard config.paired else { return }

        let result = await api.poll(base: config.apiBase, token: config.token)
        switch result.status {
        case .unauthorised:
            session = nil
            lastError = "This phone was unpaired. Pair it again from Insight."
        case .unreachable:
            lastError = "Can't reach Insight. Retrying."
        case .ok:
            session = result.session
            lastError = nil
        }
    }

    func startSession() async {
        busy = true
        defer { busy = false }

        guard let started = await phone.startSession() else {
            lastError = "Couldn't start a session. Try again."
            return
        }

        session = started
        lastError = nil
        if useFocusShortcuts { Focus.run(Focus.onShortcut) }
    }

    func stopSession() async {
        guard let key, let running = session else { return }

        busy = true
        defer { busy = false }

        // Minutes are worked out here and stored, so the insight engine never
        // recomputes them from timestamps for every row on every load.
        let minutes = max(1, Int(Date().timeIntervalSince(running.startedAt) / 60))

        guard let sealed = try? Crypto.seal(["durationMinutes": minutes], with: key),
              await phone.stopSession(id: running.id, sealed: sealed)
        else {
            lastError = "Couldn't stop the session. Try again."
            return
        }

        session = nil
        lastError = nil
        if useFocusShortcuts { Focus.run(Focus.offShortcut) }
    }

    /// Sleep for the night before a given morning.
    func logSleep(hours: Double, date: Date) async -> String? {
        guard let key else { return "Unlock first." }

        busy = true
        defer { busy = false }

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"

        guard let sealed = try? Crypto.seal(["hours": hours], with: key) else {
            return "Couldn't encrypt that."
        }

        let saved = await phone.logSleep(
            forDate: formatter.string(from: date), sealed: sealed)

        return saved ? nil : "Couldn't save that. Try again."
    }

    var insightURL: URL? {
        URL(string: config.apiBase.isEmpty
            ? "https://insight-study-sleep.vercel.app"
            : config.apiBase)
    }
}
