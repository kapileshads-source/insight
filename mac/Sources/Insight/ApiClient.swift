import Foundation

struct SessionState: Equatable {
    let id: String
    let startedAt: Date
    let focusMode: Bool
}

enum PollStatus {
    case ok
    /// The token was revoked, or was never right. Distinct from a failure
    /// because it is permanent and the student has to do something about it.
    case unauthorised
    case unreachable
}

struct PollResult {
    let status: PollStatus
    let session: SessionState?
    let blocklist: [String]
}

struct DomainTime {
    let domain: String
    let seconds: Int
}

struct BlockEvent {
    let site: String
    let overrideUsed: Bool
}

/// The two endpoints this app talks to. Both already existed for the
/// extension; nothing here is Mac-specific except the user agent.
struct ApiClient {
    private let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.httpAdditionalHeaders = ["User-Agent": "Insight-macOS/0.1"]
        return URLSession(configuration: configuration)
    }()

    private func request(_ method: String, _ path: String, base: String, token: String) -> URLRequest? {
        guard let url = URL(string: base + path) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        return request
    }

    /// Ask whether a session is running, and get the current blocklist.
    ///
    /// The website owns session state and this app only follows, exactly as
    /// the extension does — so starting a session on a phone starts recording
    /// on the laptop, and a student is never told two different things about
    /// whether they are studying.
    func poll(base: String, token: String) async -> PollResult {
        guard let request = request("GET", "/api/devices/session", base: base, token: token) else {
            return PollResult(status: .unreachable, session: nil, blocklist: [])
        }

        do {
            let (data, response) = try await session.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0

            if code == 401 {
                return PollResult(status: .unauthorised, session: nil, blocklist: [])
            }
            guard (200..<300).contains(code) else {
                return PollResult(status: .unreachable, session: nil, blocklist: [])
            }

            return ApiClient.parse(data)
        } catch {
            return PollResult(status: .unreachable, session: nil, blocklist: [])
        }
    }

    /// Split out so `SelfTest` can check the shape of what the server sends
    /// without a network.
    static func parse(_ data: Data) -> PollResult {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return PollResult(status: .ok, session: nil, blocklist: [])
        }

        var state: SessionState?
        if let raw = root["session"] as? [String: Any],
           let id = raw["id"] as? String, !id.isEmpty {
            let text = raw["startedAt"] as? String
            let startedAt = text.flatMap(iso.date(from:))
                ?? text.flatMap(isoPlain.date(from:))
                ?? Date()
            state = SessionState(
                id: id,
                startedAt: startedAt,
                focusMode: raw["focusMode"] as? Bool ?? false)
        }

        let blocklist = (root["blocklist"] as? [String] ?? [])
            .map { $0.lowercased() }
            .filter { !$0.isEmpty }

        return PollResult(status: .ok, session: state, blocklist: blocklist)
    }

    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// `toISOString()` always includes milliseconds, but a parser that only
    /// accepts them would fail silently — and a failed start time reads as a
    /// session that began just now, which quietly makes every "started N
    /// minutes ago" wrong.
    private static let isoPlain = ISO8601DateFormatter()

    /// Report what was used. App names go in the `domain` field, which is what
    /// the endpoint's author intended for the native apps.
    ///
    /// Returns false on anything other than a clean success, and the caller
    /// keeps its tally — a dropped connection should delay the data rather
    /// than destroy it.
    func postActivity(
        base: String,
        token: String,
        sessionId: String,
        domains: [DomainTime],
        blocked: [BlockEvent]
    ) async -> Bool {
        guard var request = request("POST", "/api/devices/activity", base: base, token: token) else {
            return false
        }

        let payload: [String: Any] = [
            "sessionId": sessionId,
            "domains": domains.map { ["domain": $0.domain, "seconds": $0.seconds] },
            "blocked": blocked.map { ["site": $0.site, "overrideUsed": $0.overrideUsed] },
        ]

        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return false }
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            let (_, response) = try await session.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            return (200..<300).contains(code)
        } catch {
            return false
        }
    }
}
