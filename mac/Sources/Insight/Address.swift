import Foundation

/// Whether an Insight address is safe to send a pairing code to.
///
/// The pairing screen used to accept any `http://` address. Everything this
/// app sends — the pairing code itself, then every app name during every
/// session — would then cross the network in clear text, readable by anyone
/// else on the school's wifi. A student typing "http" out of habit is not
/// making an informed choice about that.
///
/// So: https, or a local address. Plain http is still allowed to localhost and
/// to private LAN ranges, because that is how the app is developed and tested
/// against a laptop on the same network, and traffic that never leaves the
/// building is a different proposition to traffic that crosses the internet.
///
/// Deliberately identical to `windows/Address.cs`, tested case for case.
enum Address {
    static func problem(with input: String) -> String? {
        guard let url = URL(string: input.trimmingCharacters(in: .whitespaces)),
              let scheme = url.scheme?.lowercased(),
              let host = url.host, !host.isEmpty
        else {
            return "That doesn't look like a web address."
        }

        if scheme == "https" { return nil }

        guard scheme == "http" else {
            return "The address should start with https://"
        }

        if isLocal(host) { return nil }

        return "That address isn't secure. Use https:// — over plain http your "
            + "pairing code and everything this app records could be read by "
            + "anyone else on the network."
    }

    private static func isLocal(_ host: String) -> Bool {
        let name = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))

        if name == "localhost" || name == "::1" { return true }
        if name.hasSuffix(".local") { return true }

        let parts = name.split(separator: ".").map(String.init)
        guard parts.count == 4, let octets = try? parts.map({ part -> Int in
            guard let value = Int(part), (0...255).contains(value) else {
                throw CocoaError(.featureUnsupported)
            }
            return value
        }) else {
            return false
        }

        // 127/8, 10/8, 172.16/12, 192.168/16, and 169.254/16 for link-local.
        switch octets[0] {
        case 127, 10: return true
        case 172: return (16...31).contains(octets[1])
        case 192: return octets[1] == 168
        case 169: return octets[1] == 254
        default: return false
        }
    }
}
