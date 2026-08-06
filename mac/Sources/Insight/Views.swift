import AppKit

/// Small builders shared by the two windows.
///
/// Everything is laid out with stack views and auto layout, never at fixed
/// coordinates. The Windows app's first build placed controls at pixel
/// positions, and on the first display-scaled laptop it ran on, the heading
/// landed on top of the sentence beneath it. Views that size themselves can't
/// collide.
enum Views {

    static func heading(_ text: String) -> NSTextField {
        let field = label(text, font: Theme.heading, color: Theme.text)
        return field
    }

    static func prose(_ text: String) -> NSTextField {
        label(text, font: Theme.body, color: Theme.textMuted)
    }

    static func footnote(_ text: String) -> NSTextField {
        label(text, font: Theme.small, color: Theme.textFaint)
    }

    static func fieldLabel(_ text: String) -> NSTextField {
        label(text, font: Theme.body, color: Theme.textMuted)
    }

    static func label(_ text: String, font: NSFont, color: NSColor) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = font
        field.textColor = color
        field.lineBreakMode = .byWordWrapping
        field.maximumNumberOfLines = 0
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return field
    }

    static func input(_ value: String = "") -> NSTextField {
        let field = NSTextField(string: value)
        field.font = Theme.body
        field.isBezeled = true
        field.bezelStyle = .roundedBezel
        field.lineBreakMode = .byClipping
        return field
    }

    static func button(_ title: String, primary: Bool, action: @escaping () -> Void) -> NSButton {
        let button = ActionButton(title: title, target: nil, action: nil)
        button.handler = action
        button.target = button
        button.action = #selector(ActionButton.fire)
        button.bezelStyle = .rounded
        button.controlSize = .large
        button.font = Theme.body
        if primary {
            button.keyEquivalent = "\r"
            button.bezelColor = Theme.accent
        }
        return button
    }

    /// A stack that fills its window with a sensible margin.
    static func column(spacing: CGFloat = 10) -> NSStackView {
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = spacing
        stack.edgeInsets = NSEdgeInsets(top: 22, left: 24, bottom: 22, right: 24)
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }
}

/// NSButton's target/action wants a selector, and a closure is easier to read
/// at the call site than a method per button.
final class ActionButton: NSButton {
    var handler: (() -> Void)?

    @objc func fire() {
        handler?()
    }
}
