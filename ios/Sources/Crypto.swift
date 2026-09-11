import CommonCrypto
import CryptoKit
import Foundation

/// The same two-key scheme the browser uses, in Swift.
///
///     password --PBKDF2--> KEK --unwraps--> DEK --decrypts--> the data
///
/// Every constant here has to match `src/lib/crypto.ts` exactly. Get the
/// iteration count or the salt encoding wrong and nothing decrypts, which
/// surfaces as "that password doesn't match", a student would retype a
/// correct password until they gave up.
///
/// The verifier is checked before anything else for that reason: a mismatch
/// gets reported as a wrong password rather than as unreadable data.
enum Crypto {
    static let iterations = 600_000
    private static let verifierPlaintext = "insight-verifier-v1"

    struct Setup: Decodable, Sendable {
        let iterations: Int
        let salt: String
        let wrappedDek: String
        let wrapIv: String
        let verifierCipher: String
        let verifierIv: String

        init(
            iterations: Int,
            salt: String,
            wrappedDek: String,
            wrapIv: String,
            verifierCipher: String,
            verifierIv: String
        ) {
            self.iterations = iterations
            self.salt = salt
            self.wrappedDek = wrappedDek
            self.wrapIv = wrapIv
            self.verifierCipher = verifierCipher
            self.verifierIv = verifierIv
        }
    }

    enum Failure: Error {
        case wrongPassword
        case malformed
    }

    /// Unlock, returning the data key. Slow on purpose, around half a second,
    /// which is what makes a short password expensive to attack offline.
    static func unlock(password: String, setup: Setup) throws -> SymmetricKey {
        guard let salt = Data(base64Encoded: pad(setup.salt)),
              let wrapped = Data(base64Encoded: pad(setup.wrappedDek)),
              let wrapIv = Data(base64Encoded: pad(setup.wrapIv)),
              let verifier = Data(base64Encoded: pad(setup.verifierCipher)),
              let verifierIv = Data(base64Encoded: pad(setup.verifierIv))
        else {
            throw Failure.malformed
        }

        // NFKC, matching the browser's `password.normalize("NFKC")`. Two
        // visually identical passwords can be different byte sequences
        // otherwise, and the one typed on a phone keyboard is the likely
        // odd one out.
        let kek = try deriveKek(
            password: password.precomposedStringWithCompatibilityMapping,
            salt: salt,
            iterations: setup.iterations)

        guard let plain = try? open(cipher: verifier, iv: verifierIv, key: kek),
              String(data: plain, encoding: .utf8) == verifierPlaintext
        else {
            throw Failure.wrongPassword
        }

        guard let dek = try? open(cipher: wrapped, iv: wrapIv, key: kek) else {
            throw Failure.wrongPassword
        }

        return SymmetricKey(data: dek)
    }

    /// Encrypt a payload for storage. Shape matches what the browser writes:
    /// base64 ciphertext with the tag appended, and a separate base64 iv.
    static func seal<T: Encodable>(_ value: T, with key: SymmetricKey) throws -> (cipher: String, iv: String) {
        let plain = try JSONEncoder().encode(value)
        let nonce = AES.GCM.Nonce()
        let box = try AES.GCM.seal(plain, using: key, nonce: nonce)

        // WebCrypto returns ciphertext ‖ tag as one buffer; CryptoKit keeps
        // them apart. Joining them here is what makes the two interoperable.
        return (
            cipher: (box.ciphertext + box.tag).base64EncodedString(),
            iv: Data(nonce).base64EncodedString()
        )
    }

    static func reveal<T: Decodable>(
        _ type: T.Type,
        cipher: String,
        iv: String,
        with key: SymmetricKey
    ) throws -> T {
        guard let cipherData = Data(base64Encoded: pad(cipher)),
              let ivData = Data(base64Encoded: pad(iv))
        else {
            throw Failure.malformed
        }

        let plain = try open(cipher: cipherData, iv: ivData, key: key)
        return try JSONDecoder().decode(type, from: plain)
    }

    // --- the parts that must not drift ---------------------------------------

    private static func deriveKek(
        password: String,
        salt: Data,
        iterations: Int
    ) throws -> SymmetricKey {
        var derived = Data(count: 32)
        let passwordBytes = Array(password.utf8)

        let status = derived.withUnsafeMutableBytes { out in
            salt.withUnsafeBytes { saltBytes in
                CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2),
                    passwordBytes, passwordBytes.count,
                    saltBytes.bindMemory(to: UInt8.self).baseAddress, salt.count,
                    CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                    UInt32(iterations),
                    out.bindMemory(to: UInt8.self).baseAddress, 32)
            }
        }

        guard status == kCCSuccess else { throw Failure.malformed }
        return SymmetricKey(data: derived)
    }

    /// AES-GCM with a 16-byte tag, which is what WebCrypto produces by default.
    private static func open(cipher: Data, iv: Data, key: SymmetricKey) throws -> Data {
        guard cipher.count > 16 else { throw Failure.malformed }

        let body = cipher.prefix(cipher.count - 16)
        let tag = cipher.suffix(16)

        let box = try AES.GCM.SealedBox(
            nonce: AES.GCM.Nonce(data: iv), ciphertext: body, tag: tag)
        return try AES.GCM.open(box, using: key)
    }

    /// The pairing code travels as base64url with the padding stripped, so it
    /// survives being pasted anywhere. Foundation wants it back.
    private static func pad(_ value: String) -> String {
        var s = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while s.count % 4 != 0 { s += "=" }
        return s
    }
}
