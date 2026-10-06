import SwiftUI

struct SignInView: View {
    @Environment(Session.self) private var session
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var challenge: TwoFactorChallenge?
    @State private var captcha: CaptchaRequest?
    @State private var tokenDelivered = false

    var body: some View {
        Form {
            Section {
                TextField("Server (e.g. rickhouse.example.com)", text: $server)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Rickhouse")
            } footer: {
                Text("The https:// address you open Rickhouse at, through your reverse proxy.")
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
                Section { ErrorText(error) }
            }
            Section {
                Button(busy ? "Signing in…" : "Sign in", action: submit)
                    .disabled(busy || server.isEmpty || username.isEmpty || password.isEmpty)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .sheet(item: challengeBinding) { item in
            TwoFactorView(challenge: item.challenge)
        }
        .sheet(item: $captcha, onDismiss: {
            // Cancelled or swiped away without a token: let them try again.
            if !tokenDelivered { busy = false }
            tokenDelivered = false
        }) { request in
            TurnstileSheet(request: request) { token in
                tokenDelivered = true
                signIn(to: request.baseURL, captchaToken: token)
            }
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

    /// Asks the server what it needs first: with Turnstile on, the check runs
    /// in a sheet and its token is sent along with the password.
    private func submit() {
        busy = true
        error = nil
        Task {
            do {
                let url = try Session.normalise(server)
                let info = try await APIClient.serverInfo(baseURL: url)
                if let siteKey = info.turnstileSiteKey {
                    captcha = CaptchaRequest(baseURL: url, siteKey: siteKey)  // the sheet's token calls signIn
                    return
                }
                try await finishSignIn(to: url, captchaToken: nil)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    private func signIn(to url: URL, captchaToken: String) {
        busy = true
        Task {
            do { try await finishSignIn(to: url, captchaToken: captchaToken) } catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func finishSignIn(to url: URL, captchaToken: String?) async throws {
        if let pending = try await session.signIn(baseURL: url, username: username, password: password, captchaToken: captchaToken) {
            challenge = pending
        }
    }
}

struct PendingChallenge: Identifiable, Equatable {
    let id = UUID()
    let challenge: TwoFactorChallenge

    static func == (a: PendingChallenge, b: PendingChallenge) -> Bool { a.id == b.id }
}
