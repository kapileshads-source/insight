import AppKit

/// Insight for macOS.
///
/// Counts time per app while a study session is running, and hides blocked
/// apps while Focus Mode is on — the desktop half of what the browser
/// extension does for websites, and the twin of `windows/`. It talks to the
/// same two endpoints both of them do and adds nothing to the server.
///
/// The rules it lives by are in `Tracker`; the reason window titles are out of
/// reach is that reading them would need Accessibility permission, which this
/// app never asks for.

if CommandLine.arguments.contains("--self-test") {
    exit(SelfTest.run())
}

let app = NSApplication.shared

// Menu bar only: no Dock icon, no menu bar menus of its own. It is not an app
// you switch to, it's an app that sits there.
app.setActivationPolicy(.accessory)

// Top-level code is not main-actor isolated, but everything below only ever
// runs on the main thread — AppKit would fall over otherwise.
let delegate = MainActor.assumeIsolated { AppDelegate() }
app.delegate = delegate
app.run()
