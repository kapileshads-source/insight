import AppKit

/// What a blocked app is replaced with: a small window that says what
/// happened.
///
/// The app has been quit by the time this appears, so "Let me in anyway"
/// starts it again rather than merely un-hiding it.
///
/// The override is deliberately available and deliberately slightly slow. The
/// plan calls for a soft commitment rather than a hard lock, because a hard
/// lock gets the app uninstalled, and an uninstalled app records nothing at
/// all. Three seconds interrupts the reflex without becoming a punishment.
@MainActor
final class BlockedWindow: NSWindowController {
    private static let contentWidth: CGFloat = 400

    private let app: String
    private let tracker: Tracker
    private var overrideButton: NSButton!
    private var countdown: Timer?
    private var remaining = 3

    init(app: String, tracker: Tracker) {
        self.app = app
        self.tracker = tracker

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 448, height: 220),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false)
        window.title = "Insight"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = Theme.background
        window.level = .floating
        window.isReleasedWhenClosed = false

        super.init(window: window)

        let back = Views.button("Back to work", primary: true) { [weak self] in
            self?.close()
        }

        overrideButton = Views.button("Let me in anyway", primary: false) { [weak self] in
            self?.startOverride()
        }

        let buttons = NSStackView(views: [back, overrideButton])
        buttons.orientation = .horizontal
        buttons.spacing = 12

        let stack = Views.column()
        stack.setViews([
            Views.heading("Focus Mode is on"),
            Views.prose(
                "\(app) is on your blocklist, so it's been closed. If it had unsaved "
                + "work it will have asked you first."),
            buttons,
            Views.footnote(
                "Overrides are recorded, so your figures reflect what actually happened."),
        ], in: .leading)

        stack.setCustomSpacing(20, after: stack.views[1])
        stack.setCustomSpacing(16, after: buttons)

        guard let contentView = window.contentView else { return }
        contentView.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: contentView.topAnchor),
            stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: contentView.bottomAnchor),
        ])

        for view in stack.views {
            if let field = view as? NSTextField {
                field.preferredMaxLayoutWidth = BlockedWindow.contentWidth
            }
        }

        window.center()
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    func present() {
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func startOverride() {
        guard countdown == nil else { return }

        overrideButton.title = "Opening in \(remaining)…"

        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.step() }
        }
        RunLoop.main.add(timer, forMode: .common)
        countdown = timer
    }

    private func step() {
        remaining -= 1
        if remaining > 0 {
            overrideButton.title = "Opening in \(remaining)…"
            return
        }

        countdown?.invalidate()
        countdown = nil

        // Recorded before it takes effect, so a session that ends mid-override
        // still shows the override.
        tracker.recordOverride(app)
        close()
    }

    override func close() {
        countdown?.invalidate()
        countdown = nil
        super.close()
    }
}
