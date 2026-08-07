import SwiftUI

/// Insight for iPhone.
///
/// A companion, not a tracker — iOS grants no way to see which app is in
/// front without an entitlement Apple hands out to parental-control
/// companies. So this is where you start a session, log a night's sleep and
/// read what Insight made of it, and the measuring stays on the laptop.
@main
struct InsightApp: App {
    @StateObject private var store = Store()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .task { store.start() }
                .onOpenURL { store.handle(url: $0) }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: Store

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            // A bounce takes over whatever was on screen, including the pair
            // and unlock screens. Someone who just got yanked out of Instagram
            // is owed an explanation before they're asked for a password.
            if let bounced = store.bouncedFrom {
                BounceView(app: bounced.app)
            } else {
                switch store.phase {
                case .unpaired: PairView()
                case .locked: UnlockView()
                case .ready: StatusView()
                }
            }
        }
    }
}
