import SwiftUI

/// Pair this phone, with the code checked before it is kept.
struct PairView: View {
    @EnvironmentObject private var store: Store

    @State private var apiBase = "https://insight-study-sleep.vercel.app"
    @State private var code = ""
    @State private var problem: String?
    @State private var working = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Pair this phone")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(Theme.text)

                Text("On Insight, open Devices, generate a pairing code, and paste it below. It is shown once.")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.textMuted)

                field("Insight address", text: $apiBase, keyboard: .URL)
                field("Pairing code", text: $code, keyboard: .default)

                Button(action: { Task { await pair() } }) {
                    Text(working ? "Checking…" : "Pair")
                        .font(.system(size: 17, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Theme.accent)
                        .foregroundStyle(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(working || apiBase.isEmpty || code.isEmpty)

                if let problem {
                    Text(problem)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.bad)
                }

                Text("This phone never receives your encryption password, and can't read anything you've already logged. Pairing grants the ability to add, never to read.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textFaint)
            }
            .padding(24)
        }
    }

    private func field(
        _ label: String,
        text: Binding<String>,
        keyboard: UIKeyboardType
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.textMuted)

            TextField("", text: text)
                .textFieldStyle(.plain)
                .font(.system(size: 17))
                .foregroundStyle(Theme.text)
                .padding(14)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
    }

    private func pair() async {
        working = true
        defer { working = false }

        problem = await store.pair(
            base: apiBase.trimmingCharacters(in: .whitespaces),
            token: code.trimmingCharacters(in: .whitespaces))
    }
}
