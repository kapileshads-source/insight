import Foundation
import SwiftUI

/// What the phone knows, and how often it asks.
///
/// The website owns session state; this follows, exactly as the extension and
/// the desktop apps do. Starting a session here and starting one on a laptop
/// are the same act, and a student should never be told two different things
/// about whether they are studying.
@MainActor
final class Store: ObservableObject {
    @Published private(set) var session: SessionState?
    @Published private(set) var lastError: String?
    @Published private(set) var paired: Bool
    @Published private(set) var checking = false

    private let config = Config()
    private let api = ApiClient()
    private var timer: Timer?

    /// Fifteen seconds, matching the desktop apps. Focus Mode is switched on
    /// at the website, and a minute of nothing happening reads as broken.
    private static let pollSeconds: TimeInterval = 15

    init() {
        paired = config.paired
    }

    func start() {
        guard timer == nil else { return }

        let timer = Timer(timeInterval: Store.pollSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer

        Task { await refresh() }
    }

    func refresh() async {
        guard config.paired else { return }

        checking = true
        defer { checking = false }

        let result = await api.poll(base: config.apiBase, token: config.token)

        switch result.status {
        case .unauthorised:
            session = nil
            lastError = "This phone was unpaired. Pair it again from Insight."
        case .unreachable:
            lastError = "Can't reach Insight. Retrying."
        case .ok:
            session = result.session
            lastError = nil
        }
    }

    /// Verified before it is saved, so a mistyped code fails here rather than
    /// looking connected and quietly showing nothing forever.
    func pair(base: String, token: String) async -> String? {
        if let problem = Address.problem(with: base) { return problem }

        let result = await api.poll(base: base, token: token)
        switch result.status {
        case .unauthorised:
            return "That code wasn't accepted. Generate a new one on the website."
        case .unreachable:
            return "Couldn't reach \(base). Check the address and your connection."
        case .ok:
            config.apiBase = base
            config.token = token
            config.save()
            paired = true
            session = result.session
            lastError = nil
            return nil
        }
    }

    func unpair() {
        config.clear()
        paired = false
        session = nil
        lastError = nil
    }

    var insightURL: URL? {
        URL(string: config.apiBase.isEmpty
            ? "https://insight-study-sleep.vercel.app"
            : config.apiBase)
    }
}
