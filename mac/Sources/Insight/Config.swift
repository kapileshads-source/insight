import Foundation

/// The only thing this app keeps: where Insight is, and the pairing token.
///
/// Not the tally. Recorded time lives in memory and is sent every minute, so a
/// machine that is switched off — or picked up by someone who isn't the
/// student — has nothing on it saying which apps they used. That costs the
/// last minute of a session if the app is killed, which is the right trade.
///
/// ## Why not the keychain
///
/// It was the keychain first, and it had to come out.
///
/// macOS binds a keychain item to the exact binary that created it, by code
/// signature. This app is ad-hoc signed, because a Developer ID costs $99/yr
/// and this project is free by design — and an ad-hoc signature is regenerated
/// on every build. So every rebuild looked like a different program asking for
/// the old one's secret, and macOS challenged it with a password prompt. Always
/// Allow either failed outright or bought exactly one build's worth of peace.
/// A student would meet that dialog on every update of a sideloaded app, and a
/// security prompt that appears routinely is one people learn to click through,
/// which is worse than not asking.
///
/// So: a file only this user can read, which is what the Windows app's DPAPI
/// amounts to in practice. Both keep it from other accounts on a shared family
/// laptop. Neither protects against the student's own other processes, and
/// nothing available here would.
///
/// What that's worth guarding is small and revocable on purpose: the token can
/// post activity and ask whether a session is running. It cannot read anything
/// a student wrote — that is all encrypted with a key this app never has — and
/// revoking it from Devices kills it instantly.
final class Config {
    var apiBase: String
    var token: String

    var paired: Bool { !apiBase.isEmpty && !token.isEmpty }

    private static var directory: URL {
        FileManager.default
            .homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Insight", isDirectory: true)
    }

    private static var fileURL: URL {
        directory.appendingPathComponent("config.json")
    }

    private struct Stored: Codable {
        var apiBase: String
        var token: String
    }

    init() {
        let stored = Config.read()
        apiBase = stored?.apiBase ?? ""
        token = stored?.token ?? ""
    }

    private static func read() -> Stored? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(Stored.self, from: data)
    }

    func save() {
        let stored = Stored(apiBase: apiBase, token: token)
        guard let data = try? JSONEncoder().encode(stored) else { return }

        let manager = FileManager.default

        // Owner-only, on both the folder and the file. Set at creation rather
        // than after writing, so there is no instant where the token exists
        // world-readable.
        try? manager.createDirectory(
            at: Config.directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])

        if manager.fileExists(atPath: Config.fileURL.path) {
            try? manager.removeItem(at: Config.fileURL)
        }

        manager.createFile(
            atPath: Config.fileURL.path,
            contents: data,
            attributes: [.posixPermissions: 0o600])
    }

    /// Unpairing leaves nothing behind, the same as the extension's popup.
    func clear() {
        apiBase = ""
        token = ""
        try? FileManager.default.removeItem(at: Config.fileURL)
    }
}
