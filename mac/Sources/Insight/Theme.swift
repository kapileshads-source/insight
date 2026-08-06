import AppKit

/// Enough of the website's look that the two feel like one product.
///
/// The windows are forced to dark aqua rather than following the system, so a
/// student who pairs from a dark page doesn't then meet a bright grey dialog
/// that looks like it came from somewhere else.
enum Theme {
    static let background = NSColor(srgbRed: 0.055, green: 0.059, blue: 0.067, alpha: 1)
    static let surface = NSColor(srgbRed: 0.086, green: 0.094, blue: 0.106, alpha: 1)
    static let accent = NSColor(srgbRed: 0.357, green: 0.659, blue: 0.961, alpha: 1)
    static let good = NSColor(srgbRed: 0.290, green: 0.765, blue: 0.541, alpha: 1)
    static let bad = NSColor(srgbRed: 0.898, green: 0.478, blue: 0.478, alpha: 1)

    static let body = NSFont.systemFont(ofSize: 13)
    static let heading = NSFont.systemFont(ofSize: 17, weight: .semibold)
    static let small = NSFont.systemFont(ofSize: 11)

    /// Text colours come from the system so they stay legible if Apple changes
    /// what dark mode means.
    static let text = NSColor.labelColor
    static let textMuted = NSColor.secondaryLabelColor
    static let textFaint = NSColor.tertiaryLabelColor
}
