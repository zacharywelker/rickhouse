import SwiftUI
import WebKit

/// A Turnstile check the server asked for before sign-in.
struct CaptchaRequest: Identifiable {
    let id = UUID()
    let baseURL: URL
    let siteKey: String
}

/// Runs Cloudflare's Turnstile widget in a web view and hands back its token.
/// The page is loaded as if it came from the server's own address, because a
/// Turnstile site only answers on the hostnames it was set up for.
struct TurnstileSheet: View {
    let request: CaptchaRequest
    var onToken: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var failure: String?

    var body: some View {
        NavigationStack {
            VStack {
                if let failure {
                    ContentUnavailableView("The check didn't load", systemImage: "exclamationmark.triangle", description: Text(failure))
                } else {
                    TurnstileWebView(request: request) { result in
                        switch result {
                        case .token(let token):
                            onToken(token)
                            dismiss()
                        case .failed(let message):
                            failure = message
                        }
                    }
                }
            }
            .navigationTitle("Quick check")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents([.height(260)])
    }
}

private enum TurnstileResult {
    case token(String)
    case failed(String)
}

private struct TurnstileWebView: UIViewRepresentable {
    let request: CaptchaRequest
    var onResult: (TurnstileResult) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onResult) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()  // nothing from the check outlives it
        config.userContentController.add(context.coordinator, name: "turnstile")
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.loadHTMLString(Self.page(siteKey: request.siteKey), baseURL: request.baseURL)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "turnstile")
    }

    /// The site key goes in as a JSON string, so a stray quote or `</script>` can't break out of it.
    private static func page(siteKey: String) -> String {
        let json = (try? String(data: JSONEncoder().encode(siteKey), encoding: .utf8)) ?? "\"\""
        let key = json.replacingOccurrences(of: "</", with: "<\\/")
        return """
        <!doctype html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
        <style>html,body{margin:0;height:100%;background:transparent}
        body{display:flex;align-items:center;justify-content:center}</style>
        </head><body><div id="w"></div><script>
        const post = (m) => window.webkit.messageHandlers.turnstile.postMessage(m);
        let tries = 0;
        function go() {
          if (!window.turnstile) {
            if (++tries > 100) return post({ error: "Cloudflare's check couldn't be reached." });
            return setTimeout(go, 100);
          }
          turnstile.render("#w", {
            sitekey: \(key),
            callback: (t) => post({ token: t }),
            "error-callback": (e) => post({ error: "Cloudflare reported an error (" + e + ")." }),
            "expired-callback": () => turnstile.reset(),
          });
        }
        go();
        </script></body></html>
        """
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onResult: (TurnstileResult) -> Void
        private var finished = false
        init(_ onResult: @escaping (TurnstileResult) -> Void) { self.onResult = onResult }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard !finished, let body = message.body as? [String: Any] else { return }
            if let token = body["token"] as? String {
                finished = true
                onResult(.token(token))
            } else if let error = body["error"] as? String {
                finished = true
                onResult(.failed(error))
            }
        }
    }
}
