import Foundation

/// Where Insight is, and the pairing token. Nothing else.
///
/// A file in the app's own container. On iOS that is stronger than the
/// equivalent on a Mac: the sandbox is per-app and no other app can read it,
/// so this needs no keychain — and avoids the trap the Mac app hit, where a
/// re-signed binary looked like a stranger to its own keychain item.
///
/// The tally is not here. Nothing about what a student did is written to this
/// phone at all.
final class Config {
    var apiBase: String
    var token: String

    var paired: Bool { !apiBase.isEmpty && !token.isEmpty }

    private struct Stored: Codable {
        var apiBase: String
        var token: String
    }

    private static var fileURL: URL {
        let base = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("insight.json")
    }

    init() {
        let stored = try? JSONDecoder().decode(
            Stored.self, from: Data(contentsOf: Config.fileURL))
        apiBase = stored?.apiBase ?? ""
        token = stored?.token ?? ""
    }

    func save() {
        let stored = Stored(apiBase: apiBase, token: token)
        guard let data = try? JSONEncoder().encode(stored) else { return }

        let directory = Config.fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true)
        try? data.write(to: Config.fileURL, options: .completeFileProtection)
    }

    func clear() {
        apiBase = ""
        token = ""
        try? FileManager.default.removeItem(at: Config.fileURL)
    }
}
