import SwiftUI

/// The second step of sign-in. Signing in replaces this whole screen (RootView
/// switches to the collection), so there is nothing to dismiss on success.
struct TwoFactorView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let challenge: TwoFactorChallenge

    @State private var method: TwoFactorChallenge.Method = .authenticator
    @State private var code = ""
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Method", selection: $method) {
                        Text("Authenticator").tag(TwoFactorChallenge.Method.authenticator)
                        Text("Email").tag(TwoFactorChallenge.Method.emailCode)
                        Text("Backup code").tag(TwoFactorChallenge.Method.backupCode)
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section {
                    TextField(prompt, text: $code)
                        .keyboardType(method == .backupCode ? .asciiCapable : .numberPad)
                        .textContentType(.oneTimeCode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text(help)
                }
                if method == .emailCode {
                    Section {
                        Button("Email me a code", action: sendEmail).disabled(busy)
                    }
                }
                if let notice { Section { Text(notice).foregroundStyle(.secondary) } }
                if let error { Section { ErrorText(error) } }
                Section {
                    Button(busy ? "Checking…" : "Verify", action: verify)
                        .disabled(busy || code.isEmpty)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle("Two-step sign-in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onChange(of: method) { _, _ in code = ""; error = nil; notice = nil }
        }
    }

    private var prompt: String {
        switch method {
        case .authenticator: "6-digit code"
        case .emailCode: "Code from your email"
        case .backupCode: "Backup code"
        }
    }

    private var help: String {
        switch method {
        case .authenticator: "Open your authenticator app and enter the current code for Rickhouse."
        case .emailCode: "Emailed codes only work if your server has email set up."
        case .backupCode: "Each backup code works once."
        }
    }

    private func verify() {
        busy = true
        error = nil
        Task {
            do {
                try await session.complete(challenge, code: code, method: method)
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }

    private func sendEmail() {
        busy = true
        error = nil
        Task {
            do {
                try await challenge.sendEmailCode()
                notice = "Code sent. It's good for a few minutes."
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
