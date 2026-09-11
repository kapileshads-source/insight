import Foundation

/// The calls only a phone makes.
///
/// Kept apart from the `ApiClient` shared with the Mac app: that file is
/// compiled into both, and a tracker has no business knowing how to start a
/// session or write a night's sleep.
struct PhoneApi {
    let base: String
    let token: String

    private var session: URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.httpAdditionalHeaders = ["User-Agent": "Insight-iOS/0.1"]
        return URLSession(configuration: configuration)
    }

    private func post(_ path: String, body: [String: Any]) async -> [String: Any]? {
        guard let url = URL(string: base + path),
              let payload = try? JSONSerialization.data(withJSONObject: body)
        else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = payload

        guard let (data, response) = try? await session.data(for: request),
              let code = (response as? HTTPURLResponse)?.statusCode,
              (200..<300).contains(code)
        else { return nil }

        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }

    /// Starts one, or resumes the one already running, a student who left a
    /// session open on a laptop should not end up with two.
    func startSession() async -> SessionState? {
        guard let body = await post("/api/devices/session/start", body: [:]),
              let raw = body["session"] as? [String: Any],
              let id = raw["id"] as? String
        else { return nil }

        let started = (raw["startedAt"] as? String).flatMap {
            ISO8601DateFormatter().date(from: $0)
                ?? ISO8601DateFormatter.withFractionalSeconds.date(from: $0)
        } ?? Date()

        return SessionState(
            id: id, startedAt: started, focusMode: raw["focusMode"] as? Bool ?? false)
    }

    func stopSession(id: String, sealed: (cipher: String, iv: String)) async -> Bool {
        await post("/api/devices/session/stop", body: [
            "sessionId": id,
            "payload": ["cipher": sealed.cipher, "iv": sealed.iv],
        ]) != nil
    }

    func logSleep(forDate: String, sealed: (cipher: String, iv: String)) async -> Bool {
        await post("/api/devices/sleep", body: [
            "forDate": forDate,
            "payload": ["cipher": sealed.cipher, "iv": sealed.iv],
        ]) != nil
    }
}

extension ISO8601DateFormatter {
    static let withFractionalSeconds: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
