import SwiftUI

struct SignInView: View {
    @Environment(Session.self) private var session
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var challenge: TwoFactorChallenge?
    @State private var emailCodes = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 16) {
                    Image("BrandMark").resizable().scaledToFit().frame(width: 88, height: 88)
                        .accessibilityHidden(true)
                    Text("RICKHOUSE")
                        .font(.headline(34))
                        .tracking(3)
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                }
                .padding(.top, 48)
                if let url = session.serverURL {
                    credentials(for: url)
                } else {
                    serverStep
                }
            }
            .padding(.horizontal, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.paper)
        .sheet(item: challengeBinding) { item in
            TwoFactorView(challenge: item.challenge)
        }
    }

    // MARK: Step 1: the server

    private var serverStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("rickhouse.example.com", text: $server)
                .textContentType(.URL)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.continue)
                .onSubmit(verify)
                .fieldStyle(failed: error != nil)
                .accessibilityLabel("Server address")
            if let error { ErrorText(error) }
            Text("The https:// address you open Rickhouse at.")
                .font(.inter(14, relativeTo: .footnote))
                .foregroundStyle(Theme.muted)
            Button(action: verify) { Text(busy ? "Checking…" : "Continue").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(busy || server.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    /// On Continue, not per keystroke: a check per keystroke would hit the user's server for every partial hostname.
    private func verify() {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            do {
                let url = try Session.normalise(server)
                _ = try await APIClient.verifyServer(baseURL: url)
                session.saveServer(url)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    // MARK: Step 2: the account

    private func credentials(for url: URL) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(url.host() ?? url.absoluteString, systemImage: "checkmark.circle.fill")
                    .font(.inter(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Button("Change") {
                    password = ""
                    error = nil
                    server = url.absoluteString
                    session.forgetServer()
                }
                .font(.inter(15, .semibold, relativeTo: .subheadline))
                .frame(minHeight: 44)
            }
            TextField("Username", text: $username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .fieldStyle(failed: false)
            PasswordField("Password", text: $password, failed: error != nil)
            if let error { ErrorText(error) }
            Button(action: { submit(to: url) }) { Text(busy ? "Signing in…" : "Sign in").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(busy || username.isEmpty || password.isEmpty)
        }
    }

    /// `sheet(item:)` wants an Identifiable; the challenge is a plain struct.
    private var challengeBinding: Binding<PendingChallenge?> {
        Binding(
            get: { challenge.map(PendingChallenge.init) },
            set: { if $0 == nil { challenge = nil } }
        )
    }

    /// Asks the server whether it can email codes, then signs in.
    private func submit(to url: URL) {
        busy = true
        error = nil
        Task {
            do {
                emailCodes = try await APIClient.verifyServer(baseURL: url).emailCodes ?? false
                if let pending = try await session.signIn(baseURL: url, username: username, password: password, emailCodes: emailCodes) {
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

/// A password field with a 44pt show/hide toggle.
struct PasswordField: View {
    let title: String
    @Binding var text: String
    var failed = false
    @State private var shown = false

    init(_ title: String, text: Binding<String>, failed: Bool = false) {
        self.title = title
        _text = text
        self.failed = failed
    }

    var body: some View {
        HStack(spacing: 0) {
            Group {
                if shown {
                    TextField(title, text: $text).textInputAutocapitalization(.never).autocorrectionDisabled()
                } else {
                    SecureField(title, text: $text)
                }
            }
            .textContentType(.password)
            Button { shown.toggle() } label: {
                Image(systemName: shown ? "eye.slash" : "eye")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(shown ? "Hide password" : "Show password")
        }
        .padding(.leading, 12)
        .fieldBox(failed: failed)
    }
}

extension View {
    /// The bordered box sign-in fields sit in; an error adds a red border (the message and icon carry it too).
    func fieldBox(failed: Bool) -> some View {
        self.background(Color.white.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(failed ? Theme.error : Theme.muted.opacity(0.5), lineWidth: failed ? 2 : 1))
    }

    func fieldStyle(failed: Bool) -> some View {
        self.padding(12).frame(minHeight: 44).fieldBox(failed: failed)
    }
}
