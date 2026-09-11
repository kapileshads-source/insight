// swift-tools-version:5.9

import PackageDescription

/// Insight for macOS.
///
/// Built with SwiftPM rather than an Xcode project, so it builds from a
/// terminal on a machine with only the Command Line Tools installed, which is
/// what this one has. `build-app.sh` wraps the product in a .app bundle.
///
/// There is no test target. The Windows app needed one because it targets
/// `net8.0-windows` and can't run on the machine it was written on; this runs
/// natively here, so the same tests live in the app and run with
/// `Insight --self-test`.
let package = Package(
    name: "Insight",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "Insight", path: "Sources/Insight")
    ]
)
