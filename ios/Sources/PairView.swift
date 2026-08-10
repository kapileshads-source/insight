import SwiftUI

/// Pair this phone with one long code.
///
/// One field rather than two, because the phone's code carries more than a
/// token: it brings the address and the encryption setup with it, so that no
/// endpoint ever hands key material to a bearer token. `src/lib/pairing.ts`
/// explains the reasoning.
struct PairView: View {
    @EnvironmentObject private var store: Store

    @State private var code = ""
    @State private var problem: String?
    @State private var working = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Pair this phone")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(Theme.text)

                Text("On Insight, open Devices and generate a phone code. It's long — copy the whole thing and paste it here. It's shown once.")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.textMuted)

                TextEditor(text: $code)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundStyle(Theme.text)
                    .scrollContentBackground(.hidden)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .frame(height: 140)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                Button(action: pair) {
                    Text(working ? "Checking…" : "Pair")
                        .font(.system(size: 17, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Theme.accent)
                        .foregroundStyle(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(working || code.isEmpty)

                if let problem {
                    Text(problem)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.bad)
                }

                Text("The code carries your encryption setup, which is useless without your password — and your password isn't in it, and never leaves your head. Paste it once and don't share it.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textFaint)
            }
            .padding(24)
        }
    }

    private func pair() {
        working = true
        Task {
            let pasted = code
            problem = await store.pair(code: pasted)
            working = false

            guard problem == nil else { return }

            // Cleared once it's been used. The code carries the wrapped key,
            // and leaving it in a text field and on the system clipboard —
            // where any app can read it, and where Universal Clipboard hands
            // it to every other Apple device on the account — outlives every
            // reason it existed.
            code = ""
            if UIPasteboard.general.string == pasted {
                UIPasteboard.general.string = ""
            }
        }
    }
}
