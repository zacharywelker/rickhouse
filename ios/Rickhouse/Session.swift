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

    func signIn(server: String, username: String, password: String) async throws {
        let url = try Self.normalise(server)
        let result = try await APIClient.signIn(baseURL: url, username: username, password: password)
        Keychain.write(Self.tokenAccount, value: result.token)
        UserDefaults.standard.set(url.absoluteString, forKey: Self.serverKey)
        serverURL = url
        token = result.token
        user = result.user
    }

    func signOut() {
        Keychain.delete(Self.tokenAccount)
        token = nil
        user = nil
    }

    /// "rickhouse.local:1964" -> http://rickhouse.local:1964. Bare hosts get https.
    static func normalise(_ raw: String) throws -> URL {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text), url.host != nil else { throw APIError.badServer }
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
