import SwiftUI

/// Am I connected, and am I recording right now.
///
/// The same two questions the extension's popup and both tray apps answer,
/// and deliberately nothing more. Everything worth configuring lives on the
/// website, and a second place to change a setting is a second place to be
/// wrong.
struct StatusView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 12) {
                    Circle()
                        .fill(store.session != nil ? Theme.good : Theme.textFaint)
                        .frame(width: 14, height: 14)

                    Text(headline)
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(Theme.text)
                }
                .padding(.top, 40)

                Text(detail)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.textMuted)

                if let error = store.lastError {
                    Text(error)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.bad)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                VStack(spacing: 12) {
                    Button(action: { Task { await store.refresh() } }) {
                        label(store.checking ? "Checking…" : "Check now", primary: true)
                    }
                    .disabled(store.checking)

                    Button(action: { if let url = store.insightURL { openURL(url) } }) {
                        label("Open Insight", primary: false)
                    }

                    Button(action: { store.unpair() }) {
                        label("Unpair this phone", primary: false)
                    }
                }

                Text("Sessions start and stop on Insight. This follows along, so starting one here or on your laptop is the same thing.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textFaint)

                Spacer()
            }
            .padding(24)
        }
    }

    private var headline: String {
        guard let session = store.session else { return "Not studying" }
        return session.focusMode ? "Studying, Focus Mode on" : "Studying"
    }

    private var detail: String {
        guard let session = store.session else {
            return "Start a session on Insight and this turns on."
        }

        let minutes = max(0, Int(Date().timeIntervalSince(session.startedAt) / 60))
        return "Started \(minutes) minute\(minutes == 1 ? "" : "s") ago."
    }

    private func label(_ text: String, primary: Bool) -> some View {
        Text(text)
            .font(.system(size: 17, weight: primary ? .medium : .regular))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(primary ? Theme.accent : Theme.surface)
            .foregroundStyle(primary ? .black : Theme.textMuted)
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
