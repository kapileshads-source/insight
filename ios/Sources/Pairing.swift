import Foundation

/// The phone's pairing code: an address, a device token, and the encryption
/// setup, assembled in the browser and pasted here once.
///
/// `src/lib/pairing.ts` builds it, and explains why it works this way — in
/// short, so that no endpoint ever hands key material to a bearer token, and
/// "pairing grants the ability to add, never to read" stays true of every
/// token the server will honour.
struct Pairing: Decodable {
    let v: Int
    let base: String
    let token: String
    let setup: Crypto.Setup

    static func decode(_ code: String) -> Pairing? {
        var normalised = code
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while normalised.count % 4 != 0 { normalised += "=" }

        guard let data = Data(base64Encoded: normalised),
              let pairing = try? JSONDecoder().decode(Pairing.self, from: data),
              pairing.v == 1,
              !pairing.base.isEmpty,
              !pairing.token.isEmpty,
              // The iteration count arrives inside the code, so a doctored one
              // could hand the phone a KDF weak enough to brute-force — or one
              // so heavy the app appears to hang on every unlock. Both ends are
              // checked rather than trusted; the real value is 600,000.
              pairing.setup.iterations >= 100_000,
              pairing.setup.iterations <= 5_000_000
        else {
            return nil
        }

        return pairing
    }
}
