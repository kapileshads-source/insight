import AppKit
import ServiceManagement

/// The whole interface: an icon in the menu bar.
///
/// Deliberately small, for the same reason the extension's popup is. The
/// website owns sessions, Focus Mode, the blocklist and every setting worth
/// having, and duplicating any of it here would create a second place to be
/// wrong. This answers two questions — am I connected, and am I recording
/// right now — and offers the two actions that can only happen on this
/// machine: pair, and stop.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let config = Config()
    private var tracker: Tracker!
    private var statusItem: NSStatusItem!
    private var pairWindow: PairWindow?
    private var blockedWindow: BlockedWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        tracker = Tracker(config: config)
        tracker.onChange = { [weak self] in self?.refresh() }
        tracker.onBlockRequested = { [weak self] app in self?.showBlocked(app) }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu

        refresh()
        tracker.start()

        // A student who just installed this has nothing paired and no reason
        // to know the icon is even there.
        if !config.paired { showPairWindow() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Quit sends the last minute rather than dropping it. Blocking here is
        // acceptable; the alternative is losing the tail of every session.
        let semaphore = DispatchSemaphore(value: 0)
        Task { @MainActor in
            await tracker.flushBeforeExit()
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 5)
    }

    // --- icon ---------------------------------------------------------------

    /// The menu bar icon, drawn rather than shipped.
    ///
    /// It has one job — say at a glance whether this is recording — which is
    /// the same job the extension popup's dot does. Drawing it means the state
    /// *is* the icon, and there's no image file to keep in step.
    ///
    /// Not a template image: macOS tints those to a single colour, which is
    /// exactly the distinction being drawn here.
    private func icon(recording: Bool) -> NSImage {
        let size = NSSize(width: 18, height: 18)

        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.secondaryLabelColor.setStroke()
            let ring = NSBezierPath(ovalIn: rect.insetBy(dx: 2, dy: 2))
            ring.lineWidth = 1.5
            ring.stroke()

            (recording ? Theme.good : NSColor.tertiaryLabelColor).setFill()
            NSBezierPath(ovalIn: rect.insetBy(dx: 6, dy: 6)).fill()
            return true
        }
        image.isTemplate = false
        return image
    }

    private func refresh() {
        statusItem.button?.image = icon(recording: tracker.session != nil)
        statusItem.button?.toolTip = "Insight — " + statusLine()
    }

    private func statusLine() -> String {
        if !config.paired { return "not paired yet" }
        if let error = tracker.lastError { return error }
        guard let session = tracker.session else { return "not studying" }
        return session.focusMode ? "studying, Focus Mode on" : "studying"
    }

    private func detailLine() -> String {
        if !config.paired { return "Pair this Mac to start." }
        guard let session = tracker.session else {
            return "Start a session on Insight and this turns on."
        }

        let minutes = max(0, Int(Date().timeIntervalSince(session.startedAt) / 60))
        return "Started \(minutes) minute\(minutes == 1 ? "" : "s") ago."
    }

    // --- menu ---------------------------------------------------------------

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        menu.addItem(disabled(statusLine()))
        menu.addItem(disabled(detailLine()))
        menu.addItem(.separator())

        if config.paired {
            menu.addItem(action("Check now") { [weak self] in self?.tracker.pollNow() })
            menu.addItem(action("Unpair this Mac") { [weak self] in self?.unpair() })
        } else {
            menu.addItem(action("Pair this Mac…") { [weak self] in self?.showPairWindow() })
        }

        menu.addItem(action("Open Insight") { [weak self] in self?.openInsight() })

        let startup = action("Open at Login") { [weak self] in self?.toggleLoginItem() }
        startup.state = opensAtLogin() ? .on : .off
        menu.addItem(startup)

        menu.addItem(.separator())
        menu.addItem(action("Quit Insight") { NSApp.terminate(nil) })
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func action(_ title: String, handler: @escaping () -> Void) -> NSMenuItem {
        let item = MenuItem(title: title, action: nil, keyEquivalent: "")
        item.handler = handler
        item.target = item
        item.action = #selector(MenuItem.fire)
        return item
    }

    private func openInsight() {
        let base = config.apiBase.isEmpty
            ? "https://insight-study-sleep.vercel.app"
            : config.apiBase
        guard let url = URL(string: base) else { return }
        NSWorkspace.shared.open(url)
    }

    private func unpair() {
        let alert = NSAlert()
        alert.messageText = "Unpair this Mac?"
        alert.informativeText =
            "Anything counted and not yet sent is discarded, and nothing is recorded "
            + "here until you pair it again."
        alert.addButton(withTitle: "Unpair")
        alert.addButton(withTitle: "Cancel")
        alert.alertStyle = .warning

        guard alert.runModal() == .alertFirstButtonReturn else { return }

        tracker.unpair()
        refresh()
    }

    private func showPairWindow() {
        if pairWindow == nil {
            pairWindow = PairWindow(config: config, tracker: tracker)
        }
        pairWindow?.present()
    }

    private func showBlocked(_ app: String) {
        blockedWindow?.close()
        blockedWindow = BlockedWindow(app: app, tracker: tracker)
        blockedWindow?.present()
    }

    // --- open at login ------------------------------------------------------

    /// Worth having: an app that only counts while a session is running is
    /// useless if it isn't running itself, and a student who forgets to launch
    /// it gets a silent gap that reads as focused time.
    ///
    /// Only works from inside a .app bundle — `swift run` has nothing for the
    /// system to register, so the item is simply off in that case.
    private func opensAtLogin() -> Bool {
        guard Bundle.main.bundleIdentifier != nil else { return false }
        return SMAppService.mainApp.status == .enabled
    }

    private func toggleLoginItem() {
        guard Bundle.main.bundleIdentifier != nil else { return }

        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = "Couldn't change that"
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }
}

/// NSMenuItem wants a target and a selector; a closure reads better where the
/// menu is built.
final class MenuItem: NSMenuItem {
    var handler: (() -> Void)?

    @objc func fire() {
        handler?()
    }
}
