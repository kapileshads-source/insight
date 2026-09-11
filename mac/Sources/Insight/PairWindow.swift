import AppKit

/// Pair this Mac with an Insight account.
///
/// The same two fields as the extension's popup, and the same rule: the code
/// is verified against the server before it is saved. A code that is saved
/// without being checked produces an app that looks connected, records
/// nothing, and gives a student no way to tell, which is worse than a window
/// that says no.
@MainActor
final class PairWindow: NSWindowController {
    private static let defaultApiBase = "https://insight-study-sleep.vercel.app"
    private static let contentWidth: CGFloat = 420

    private let tracker: Tracker
    private let config: Config

    private let apiBaseField = Views.input()
    private let tokenField = Views.input()
    private let errorLabel = Views.label("", font: Theme.body, color: Theme.bad)
    private var pairButton: NSButton!

    init(config: Config, tracker: Tracker) {
        self.config = config
        self.tracker = tracker

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 470, height: 320),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false)
        window.title = "Pair with Insight"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = Theme.background
        window.isReleasedWhenClosed = false

        super.init(window: window)

        apiBaseField.stringValue = config.apiBase.isEmpty ? PairWindow.defaultApiBase : config.apiBase

        pairButton = Views.button("Pair", primary: true) { [weak self] in
            self?.pair()
        }

        errorLabel.isHidden = true

        let stack = Views.column()
        stack.setViews([
            Views.heading("Pair this Mac"),
            Views.prose(
                "On Insight, open Devices, generate a Mac pairing code, and paste it "
                + "below. It is shown once."),
            Views.fieldLabel("Insight address"),
            apiBaseField,
            Views.fieldLabel("Pairing code"),
            tokenField,
            pairButton,
            errorLabel,
            Views.footnote(
                "This Mac never receives your encryption password, and never reads "
                + "window titles, only which apps were in front."),
        ], in: .leading)

        // A little more air around the field groups than the default spacing,
        // without hand-placing anything.
        stack.setCustomSpacing(18, after: stack.views[1])
        stack.setCustomSpacing(14, after: apiBaseField)
        stack.setCustomSpacing(18, after: tokenField)

        guard let contentView = window.contentView else { return }
        contentView.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: contentView.topAnchor),
            stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: contentView.bottomAnchor),
            apiBaseField.widthAnchor.constraint(equalToConstant: PairWindow.contentWidth),
            tokenField.widthAnchor.constraint(equalToConstant: PairWindow.contentWidth),
        ])

        for view in stack.views {
            if let field = view as? NSTextField, !field.isEditable {
                field.preferredMaxLayoutWidth = PairWindow.contentWidth
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

    private func fail(_ message: String) {
        errorLabel.stringValue = message
        errorLabel.isHidden = false
    }

    private func pair() {
        let base = apiBaseField.stringValue
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        let token = tokenField.stringValue.trimmingCharacters(in: .whitespaces)

        errorLabel.isHidden = true

        guard !base.isEmpty, !token.isEmpty else {
            fail("Both fields are needed.")
            return
        }
        if let problem = Address.problem(with: base) {
            fail(problem)
            return
        }

        pairButton.isEnabled = false
        pairButton.title = "Checking…"

        Task { @MainActor in
            let result = await tracker.verify(base: base, token: token)

            pairButton.isEnabled = true
            pairButton.title = "Pair"

            // Each failure is named separately. Grouping them blames a bad
            // code on the network and sends you looking at the wrong thing,
            // the same mistake as any error message that guesses.
            switch result.status {
            case .unauthorised:
                fail("That code wasn't accepted. Generate a new one on the website.")
            case .unreachable:
                fail("Couldn't reach \(base). Check the address and your connection.")
            case .ok:
                tracker.applyPairing(base: base, token: token, result: result)
                close()
            }
        }
    }
}
