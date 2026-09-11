import SwiftUI

/// The screen you actually open: is a session running, start or stop one, and
/// log last night's sleep.
///
/// Still deliberately small. The blocklist, the settings and the insights all
/// live on the website, and a second place to change something is a second
/// place to be wrong.
struct StatusView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.openURL) private var openURL

    @State private var sleepHours = ""
    @State private var note: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                status
                sessionButton
                sleep
                settings
                Spacer(minLength: 40)
            }
            .padding(24)
        }
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Circle()
                    .fill(store.session != nil ? Theme.good : Theme.textFaint)
                    .frame(width: 14, height: 14)

                Text(headline)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Theme.text)
            }

            Text(detail)
                .font(.system(size: 16))
                .foregroundStyle(Theme.textMuted)

            if let error = store.lastError {
                Text(error)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.bad)
            }
        }
        .padding(.top, 40)
    }

    private var sessionButton: some View {
        Button {
            Task {
                if store.session == nil {
                    await store.startSession()
                } else {
                    await store.stopSession()
                }
            }
        } label: {
            Text(store.session == nil ? "Start a session" : "Stop the session")
                .font(.system(size: 17, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(store.session == nil ? Theme.accent : Theme.surface)
                .foregroundStyle(store.session == nil ? .black : Theme.text)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(store.busy)
    }

    private var sleep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Last night")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.text)

            Text("How many hours did you sleep? Logged against last night, which is what the phone is better at than a laptop.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.textMuted)

            HStack(spacing: 10) {
                TextField("7.5", text: $sleepHours)
                    .textFieldStyle(.plain)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.text)
                    .keyboardType(.decimalPad)
                    .padding(14)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                Button("Save") {
                    Task { await saveSleep() }
                }
                .font(.system(size: 17, weight: .medium))
                .padding(.horizontal, 22)
                .padding(.vertical, 14)
                .background(Theme.surface)
                .foregroundStyle(Theme.accent)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .disabled(store.busy || sleepHours.isEmpty)
            }

            if let note {
                Text(note)
                    .font(.system(size: 14))
                    .foregroundStyle(note == "Saved." ? Theme.good : Theme.bad)
            }
        }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 14) {
            Toggle(isOn: $store.useFocusShortcuts) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Use a Focus shortcut")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.text)
                    Text("Runs your “\(Focus.onShortcut)” shortcut when a session starts, and “\(Focus.offShortcut)” when it ends. iOS won't let an app block another app, so a Focus is as close as this gets.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textFaint)
                }
            }
            .tint(Theme.accent)

            Divider().overlay(Theme.line)

            Button("Open Insight") { if let url = store.insightURL { openURL(url) } }
                .font(.system(size: 16))
                .foregroundStyle(Theme.textMuted)

            Button("Lock this phone") { store.lock() }
                .font(.system(size: 16))
                .foregroundStyle(Theme.textMuted)

            Button("Unpair this phone") { store.unpair() }
                .font(.system(size: 16))
                .foregroundStyle(Theme.textMuted)
        }
    }

    private var headline: String {
        guard let session = store.session else { return "Not studying" }
        return session.focusMode ? "Studying, Focus Mode on" : "Studying"
    }

    private var detail: String {
        guard let session = store.session else {
            return "Start one here, or on any device, they're the same session."
        }

        let minutes = max(0, Int(Date().timeIntervalSince(session.startedAt) / 60))
        return "Started \(minutes) minute\(minutes == 1 ? "" : "s") ago."
    }

    private func saveSleep() async {
        guard let hours = Double(sleepHours), hours > 0, hours <= 24 else {
            note = "Hours should be somewhere between 0 and 24."
            return
        }

        // The night before this morning, which is what a student means when
        // they open this at breakfast.
        let problem = await store.logSleep(hours: hours, date: Date())
        note = problem ?? "Saved."
        if problem == nil { sleepHours = "" }
    }
}
