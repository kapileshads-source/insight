import SwiftUI

/// What a student sees the instant their phone pulls them out of something.
///
/// The tone is the design. This lands at the exact moment someone feels caught,
/// and a screen that tells them off is one they'll delete the automation to
/// avoid — which protects them from nothing. So: what happened, how far into
/// the session they are, and out of the way. The same reasoning as the
/// three-second countdown on the desktop apps.
struct BounceView: View {
    @EnvironmentObject private var store: Store
    let app: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer()

            Text(store.session != nil ? "You're mid-session." : "You meant to leave that alone.")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(Theme.text)

            if let app {
                Text("You just opened \(app), and your phone brought you here instead. That was your own doing — you set it up.")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.textMuted)
            } else {
                Text("Your phone bounced you out of something you asked it to bounce you out of.")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.textMuted)
            }

            if let session = store.session {
                let minutes = max(0, Int(Date().timeIntervalSince(session.startedAt) / 60))
                Text("\(minutes) minute\(minutes == 1 ? "" : "s") in so far. Going back now keeps it whole.")
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.text)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Spacer()

            Button(action: { store.dismissBounce() }) {
                Text("Back to it")
                    .font(.system(size: 17, weight: .medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Theme.accent)
                    .foregroundStyle(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Text("This is an interruption, not a wall — iOS only lets software Apple has vetted actually block an app. Delete the automation in Shortcuts whenever you want; no password, no waiting.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textFaint)
        }
        .padding(24)
    }
}
