import SwiftUI

struct SignInView: View {
    @Environment(Session.self) private var session
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var challenge: TwoFactorChallenge?

    var body: some View {
        Form {
            Section {
                TextField("Server (e.g. rickhouse.local:1964)", text: $server)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Rickhouse")
            } footer: {
                Text("The address you open Rickhouse at in a browser. Use http:// for a plain home-network server.")
            }
            Section {
                TextField("Username", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password)
                    .textContentType(.password)
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
            Section {
                Button(busy ? "Signing in…" : "Sign in", action: submit)
                    .disabled(busy || server.isEmpty || username.isEmpty || password.isEmpty)
            }
        }
        .sheet(item: challengeBinding) { item in
            TwoFactorView(challenge: item.challenge)
        }
        .onAppear { if server.isEmpty, let url = session.serverURL { server = url.absoluteString } }
    }

    /// `sheet(item:)` wants an Identifiable; the challenge is a plain struct.
    private var challengeBinding: Binding<PendingChallenge?> {
        Binding(
            get: { challenge.map(PendingChallenge.init) },
            set: { if $0 == nil { challenge = nil } }
        )
    }

    private func submit() {
        busy = true
        error = nil
        Task {
            do {
                if let pending = try await session.signIn(server: server, username: username, password: password) {
                    challenge = pending
                }
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

struct PendingChallenge: Identifiable, Equatable {
    let id = UUID()
    let challenge: TwoFactorChallenge

    static func == (a: PendingChallenge, b: PendingChallenge) -> Bool { a.id == b.id }
}
