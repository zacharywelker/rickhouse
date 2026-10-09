import SwiftUI

/// The second step of sign-in. Signing in replaces this whole screen (RootView
/// switches to the collection), so there is nothing to dismiss on success.
struct TwoFactorView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let challenge: TwoFactorChallenge

    /// How long "Email me a code" stays locked after a send.
    /// ponytail: app-side only; the server should enforce and report this so it survives a relaunch.
    private static let resendSeconds = 30

    @State private var method: TwoFactorChallenge.Method = .authenticator
    @State private var code = ""
    @State private var busy = false
    @State private var resendAt: Date?
    @State private var error: String?

    /// Boxes appear for an emailed code only once the server has sent one.
    private var showsBoxes: Bool { method == .authenticator || (method == .emailCode && resendAt != nil) }
    private var isReady: Bool {
        switch method {
        case .backupCode: !code.trimmingCharacters(in: .whitespaces).isEmpty
        default: code.count == CodeBoxes.length
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Method", selection: $method) {
                        Text("Authenticator").tag(TwoFactorChallenge.Method.authenticator)
                        if challenge.emailCodes { Text("Email").tag(TwoFactorChallenge.Method.emailCode) }
                        Text("Backup code").tag(TwoFactorChallenge.Method.backupCode)
                    }
                    .pickerStyle(.segmented)

                    Text(help)
                        .font(.inter(15, relativeTo: .subheadline))
                        .foregroundStyle(Theme.muted)

                    if method == .emailCode && resendAt == nil {
                        Button(action: sendEmail) { Text(busy ? "Sending…" : "Email me a code").frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled(busy)
                    }
                    if showsBoxes { CodeBoxes(code: $code, failed: error != nil) }
                    if method == .backupCode {
                        TextField("Backup code", text: $code)
                            .keyboardType(.asciiCapable)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .fieldStyle(failed: error != nil)
                    }
                    if method == .emailCode, let resendAt { resend(after: resendAt) }
                    if let error { ErrorText(error) }
                    if method != .emailCode || resendAt != nil {
                        Button(action: verify) { Text(busy ? "Checking…" : "Verify").frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled(busy || !isReady)
                    }
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper)
            .navigationTitle("Two-step sign-in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onChange(of: method) { _, _ in code = ""; error = nil }
        }
    }

    private var help: String {
        switch method {
        case .authenticator: "Open your authenticator app and enter the current code for Rickhouse."
        case .emailCode where resendAt == nil: "We'll email a 6-digit code to the address on your account."
        case .emailCode: "Enter the 6-digit code we emailed you. It's good for a few minutes."
        case .backupCode: "Each backup code works once."
        }
    }

    /// "Resend code in 0:30", then a button.
    private func resend(after date: Date) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(date.timeIntervalSince(context.date).rounded(.up)))
            if left > 0 {
                Text("Resend code in \(left / 60):\(String(format: "%02d", left % 60))")
                    .font(.inter(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.muted)
                    .frame(minHeight: 44)
            } else {
                Button("Resend code", action: sendEmail).disabled(busy).frame(minHeight: 44)
            }
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
                code = ""
                resendAt = Date().addingTimeInterval(TimeInterval(Self.resendSeconds))
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

/// Six digit boxes drawn from one real text field. iOS fills a texted or emailed
/// code into a single `.oneTimeCode` field, so the field is the input and the
/// boxes only show its value. The field sits over the boxes, invisible, so
/// tapping, pasting and VoiceOver all reach it.
struct CodeBoxes: View {
    static let length = 6

    @Binding var code: String
    var failed = false
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            HStack(spacing: 8) {
                ForEach(0..<Self.length, id: \.self) { index in box(index) }
            }
            .accessibilityHidden(true)

            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .foregroundStyle(.clear)
                .tint(.clear)
                .autocorrectionDisabled()
                .accessibilityLabel("Code")
                .accessibilityValue(code.isEmpty ? "Empty, \(Self.length) digits" : "Digit \(code.count) of \(Self.length) entered")
                .onChange(of: code) { _, new in
                    let digits = String(new.filter(\.isASCII).filter(\.isNumber).prefix(Self.length))
                    if digits != new { code = digits }
                }
        }
        .frame(maxWidth: .infinity)
        .onAppear { focused = true }
    }

    private func box(_ index: Int) -> some View {
        let digits = Array(code)
        let active = focused && index == min(code.count, Self.length - 1)
        return Text(index < digits.count ? String(digits[index]) : "")
            .font(.inter(26, .semibold, relativeTo: .title2))
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(Color.white.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10)
                .stroke(failed ? Theme.error : (active ? Theme.ink : Theme.muted.opacity(0.5)), lineWidth: failed || active ? 2 : 1))
    }
}
