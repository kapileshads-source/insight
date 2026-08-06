import Foundation
import Security

/// The only thing this app keeps: where Insight is, and the pairing token.
///
/// Not the tally. Recorded time lives in memory and is sent every minute, so a
/// machine that is switched off — or picked up by someone who isn't the
/// student — has nothing on it saying which apps they used. That costs the
/// last minute of a session if the app is killed, which is the right trade.
///
/// The address goes in UserDefaults because it is not a secret. The token goes
/// in the login keychain, which is the Mac's answer to the Windows version's
/// DPAPI: another account on a shared family laptop can't read it out.
final class Config {
    private static let service = "app.insight.mac"
    private static let account = "pairing-token"
    private static let baseKey = "InsightApiBase"

    var apiBase: String
    var token: String

    var paired: Bool { !apiBase.isEmpty && !token.isEmpty }

    init() {
        apiBase = UserDefaults.standard.string(forKey: Config.baseKey) ?? ""
        token = Config.readToken() ?? ""
    }

    func save() {
        UserDefaults.standard.set(apiBase, forKey: Config.baseKey)
        Config.writeToken(token)
    }

    /// Unpairing leaves nothing behind, the same as the extension's popup.
    func clear() {
        apiBase = ""
        token = ""
        UserDefaults.standard.removeObject(forKey: Config.baseKey)
        Config.deleteToken()
    }

    // --- keychain -----------------------------------------------------------

    private static func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    private static func readToken() -> String? {
        var lookup = query()
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private static func writeToken(_ token: String) {
        deleteToken()
        guard !token.isEmpty else { return }

        var item = query()
        item[kSecValueData as String] = Data(token.utf8)
        // Readable without an unlock prompt once the machine is logged in,
        // because the app polls every minute in the background and a keychain
        // dialog every time would be intolerable.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        SecItemAdd(item as CFDictionary, nil)
    }

    private static func deleteToken() {
        SecItemDelete(query() as CFDictionary)
    }
}
