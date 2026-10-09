import Foundation
import Security
import Observation

/// Server address and bearer token. The token lives in the Keychain; the
/// address is not secret, so it sits in UserDefaults.
@Observable
final class Session {
    private(set) var token: String?
    private(set) var user: User?
    var serverURL: URL?

    private static let serverKey = "serverURL"
    private static let tokenAccount = "authToken"

    var isSignedIn: Bool { token != nil && serverURL != nil }

    /// The flavor wheels by id, loaded once when first needed. A tasting stores descriptor keys, and these say what
    /// each one is called.
    private(set) var wheels: [String: TastingWheel] = [:]
    private var flavorNames: [String: String] = [:]

    func loadWheels() async {
        guard wheels.isEmpty, let api, let list = try? await api.tastingWheels() else { return }
        wheels = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
        flavorNames = Dictionary(
            list.flatMap { $0.categories.flatMap(\.descriptors) }.map { ($0.key, $0.label) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    /// "Caramel" for "bourbon/sweet/confectionary/caramel". Before the wheels have loaded, or for a word no longer
    /// on its wheel, it is made from the key.
    func flavorName(_ key: String) -> String {
        if let name = flavorNames[key] { return name }
        let word = (key.split(separator: "/").last.map(String.init) ?? key).replacingOccurrences(of: "-", with: " ")
        return word.prefix(1).uppercased() + word.dropFirst()
    }

    var api: APIClient? {
        guard let serverURL, let token else { return nil }
        return APIClient(baseURL: serverURL, token: token)
    }

    init() {
        if let raw = UserDefaults.standard.string(forKey: Self.serverKey) {
            serverURL = URL(string: raw)
        }
        token = Keychain.read(Self.tokenAccount)
    }

    /// Remembers a server that passed `APIClient.verifyServer`, so later launches skip the address step.
    func saveServer(_ url: URL) {
        UserDefaults.standard.set(url.absoluteString, forKey: Self.serverKey)
        serverURL = url
    }

    /// "Change" on the sign-in screen. A token only works on the server that issued it, so it goes too.
    func forgetServer() {
        signOut()
        UserDefaults.standard.removeObject(forKey: Self.serverKey)
        serverURL = nil
    }

    /// On launch, drop a token the server no longer accepts.
    func restore() async {
        guard let api else { return }
        do {
            user = try await api.me()
        } catch APIError.unauthorized {
            signOut()
        } catch {
            // Offline or server down: stay signed in and let screens report it.
        }
    }

    /// Signs in, or returns the second-factor step for the caller to finish with `complete`.
    func signIn(baseURL url: URL, username: String, password: String, emailCodes: Bool) async throws -> TwoFactorChallenge? {
        let outcome = try await APIClient.signIn(baseURL: url, username: username, password: password, emailCodes: emailCodes)
        return accept(outcome, baseURL: url)
    }

    /// Finishes a two-step sign-in with the code from the authenticator app, a backup code or email.
    func complete(_ challenge: TwoFactorChallenge, code: String, method: TwoFactorChallenge.Method) async throws {
        let outcome = try await challenge.verify(code.trimmingCharacters(in: .whitespaces), method: method)
        _ = accept(outcome, baseURL: challenge.baseURL)
    }

    private func accept(_ outcome: APIClient.SignInOutcome, baseURL: URL) -> TwoFactorChallenge? {
        switch outcome {
        case .needsSecondFactor(let challenge):
            return challenge
        case .signedIn(let token, let user):
            Keychain.write(Self.tokenAccount, value: token)
            UserDefaults.standard.set(baseURL.absoluteString, forKey: Self.serverKey)
            serverURL = baseURL
            self.token = token
            self.user = user
            return nil
        }
    }

    func signOut() {
        Keychain.delete(Self.tokenAccount)
        token = nil
        user = nil
    }

    /// "rickhouse.example.com" -> https://rickhouse.example.com. Release builds
    /// refuse http:// so the token never crosses the network in the clear;
    /// Debug builds allow it for a local development server.
    static func normalise(_ raw: String) throws -> URL {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text), url.host != nil else { throw APIError.badServer }
        #if !DEBUG
        guard url.scheme?.lowercased() == "https" else { throw APIError.insecureServer }
        #endif
        return url
    }
}

enum Keychain {
    private static let service = "com.zacharywelker.rickhouse"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    static func read(_ account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ account: String, value: String) {
        delete(account)
        var q = query(account)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete(_ account: String) {
        SecItemDelete(query(account) as CFDictionary)
    }
}
