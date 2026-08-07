import SwiftUI

/// The password screen. Not a login — the account is already paired; this is
/// what turns ciphertext into your data, and it happens entirely on the phone.
struct UnlockView: View {
    @EnvironmentObject private var store: Store

    @State private var password = ""
    @State private var problem: String?
    @State private var working = false
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Unlock")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(Theme.text)

                Text("Your encryption password — the one you chose when you signed up. It never leaves this phone, and there's no way to reset it.")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.textMuted)

                SecureField("", text: $password)
                    .textFieldStyle(.plain)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.text)
                    .padding(14)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .focused($focused)
                    .submitLabel(.go)
                    .onSubmit { unlock() }

                Button(action: unlock) {
                    Text(working ? "Unlocking…" : "Unlock")
                        .font(.system(size: 17, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Theme.accent)
                        .foregroundStyle(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(working || password.isEmpty)

                if let problem {
                    Text(problem)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.bad)
                }

                Text("Takes a second — the delay is deliberate, and it's what makes a short password expensive to attack.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textFaint)
            }
            .padding(24)
        }
        .onAppear { focused = true }
    }

    private func unlock() {
        guard !password.isEmpty else { return }
        working = true

        Task {
            problem = await store.unlock(password: password)
            working = false
            if problem == nil { password = "" }
        }
    }
}
