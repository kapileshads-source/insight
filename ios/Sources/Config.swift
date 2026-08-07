import Foundation

/// Where Insight is, the pairing token, and the encryption setup.
///
/// A file in the app's own container. On iOS that beats the keychain: the
/// sandbox is per-app, and it sidesteps the trap the Mac app hit, where a
/// re-signed binary looked like a stranger to its own keychain item.
///
/// **The password is not here, and the key derived from it is not here.** The
/// key lives in memory only, so closing the app locks it again — which is the
/// same bargain the browser makes, and the reason a lost phone is a lost
/// phone rather than a lost diary.
///
/// The setup *is* here, and it's the public half by design: a salt is not a
/// secret and a wrapped key is useless without the password.
final class Config {
    var apiBase: String
    var token: String
    var setup: Crypto.Setup?
    var useFocusShortcuts: Bool

    var paired: Bool { !apiBase.isEmpty && !token.isEmpty && setup != nil }

    private struct Stored: Codable {
        var apiBase: String
        var token: String
        var setup: StoredSetup?
        var useFocusShortcuts: Bool?
    }

    /// Mirrors `Crypto.Setup`, which is decode-only because it arrives from a
    /// pairing code. This is the writable twin.
    struct StoredSetup: Codable {
        var iterations: Int
        var salt: String
        var wrappedDek: String
        var wrapIv: String
        var verifierCipher: String
        var verifierIv: String
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
        useFocusShortcuts = stored?.useFocusShortcuts ?? false

        if let s = stored?.setup {
            setup = Crypto.Setup(
                iterations: s.iterations,
                salt: s.salt,
                wrappedDek: s.wrappedDek,
                wrapIv: s.wrapIv,
                verifierCipher: s.verifierCipher,
                verifierIv: s.verifierIv)
        }
    }

    func save() {
        let stored = Stored(
            apiBase: apiBase,
            token: token,
            setup: setup.map {
                StoredSetup(
                    iterations: $0.iterations,
                    salt: $0.salt,
                    wrappedDek: $0.wrappedDek,
                    wrapIv: $0.wrapIv,
                    verifierCipher: $0.verifierCipher,
                    verifierIv: $0.verifierIv)
            },
            useFocusShortcuts: useFocusShortcuts)

        guard let data = try? JSONEncoder().encode(stored) else { return }

        let directory = Config.fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true)
        try? data.write(to: Config.fileURL, options: .completeFileProtection)
    }

    func clear() {
        apiBase = ""
        token = ""
        setup = nil
        useFocusShortcuts = false
        try? FileManager.default.removeItem(at: Config.fileURL)
    }
}
