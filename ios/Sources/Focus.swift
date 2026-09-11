import UIKit

/// Focus Mode, as far as iOS allows.
///
/// Blocking an app needs the `ManagedSettings` entitlement, which Apple grants
/// to parental-control companies rather than sells. What's left is Apple's own
/// Focus: it hides apps from the Home Screen and silences their notifications,
/// and a Shortcut can turn one on.
///
/// So Insight runs the student's shortcut when a session starts and again when
/// it ends. It's friction rather than a lock, which is what Focus Mode has
/// always been here: the desktop apps give three seconds and a way through,
/// because a hard lock gets uninstalled.
///
/// It fails quietly by design. A student who hasn't made the shortcuts should
/// get a working session, not an error about something optional.
enum Focus {
    static let onShortcut = "Insight Study On"
    static let offShortcut = "Insight Study Off"

    static func run(_ name: String) {
        guard let encoded = name.addingPercentEncoding(
                withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "shortcuts://run-shortcut?name=\(encoded)")
        else { return }

        UIApplication.shared.open(url)
    }
}
