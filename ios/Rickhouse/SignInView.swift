import SwiftUI

struct SignInView: View {
    @Environment(Session.self) private var session
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

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
        .onAppear { if server.isEmpty, let url = session.serverURL { server = url.absoluteString } }
    }

    private func submit() {
        busy = true
        error = nil
        Task {
            do {
                try await session.signIn(server: server, username: username, password: password)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
