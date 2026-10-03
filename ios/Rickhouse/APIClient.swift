import Foundation

enum APIError: LocalizedError {
    case badServer
    case unauthorized
    case twoFactorUnsupported
    case server(String)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .badServer: "That doesn't look like a server address."
        case .unauthorized: "Your session has ended. Sign in again."
        case .twoFactorUnsupported: "This account uses two-step sign-in, which the app doesn't support yet. Turn it off in the web app's account settings to sign in here."
        case .server(let message): message
        case .transport(let error): error.localizedDescription
        }
    }
}

/// The server's `/api/v1` and the few web routes the app borrows
/// (`/api/auth/*`, `/api/images/*`, `/api/bottles/:id/images`). Each carries
/// the Bearer token, so no cookie jar is involved.
struct APIClient {
    let baseURL: URL
    let token: String

    private static let decoder = JSONDecoder()

    // MARK: Sign in

    static func signIn(baseURL: URL, username: String, password: String) async throws -> (token: String, user: User) {
        var request = URLRequest(url: baseURL.appending(path: "api/auth/sign-in/username"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Better Auth checks Origin against the host it is served from.
        request.setValue(baseURL.absoluteString, forHTTPHeaderField: "Origin")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["username": username, "password": password])

        let (data, response) = try await send(request)
        guard let http = response as? HTTPURLResponse else { throw APIError.badServer }

        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           object["twoFactorRedirect"] as? Bool == true {
            throw APIError.twoFactorUnsupported
        }
        guard http.statusCode == 200 else { throw APIError.server(message(from: data) ?? "Wrong username or password.") }
        guard let token = http.value(forHTTPHeaderField: "set-auth-token") else {
            throw APIError.server("The server didn't hand back a token. Is it up to date?")
        }
        let me = try await APIClient(baseURL: baseURL, token: token).me()
        return (token, me)
    }

    // MARK: Reads

    func me() async throws -> User {
        try await get("api/v1/me", as: MeResponse.self).user
    }

    func bottles(query: String, status: String?, page: Int) async throws -> BottlePage {
        var items = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "size", value: "50")]
        if !query.isEmpty { items.append(.init(name: "q", value: query)) }
        if let status { items.append(.init(name: "status", value: status)) }
        return try await get("api/v1/bottles", query: items, as: BottlePage.self)
    }

    func bottle(id: Int) async throws -> BottleDetail {
        try await get("api/v1/bottles/\(id)", as: BottleDetail.self)
    }

    func labels(matching query: String) async throws -> [LabelOption] {
        try await get("api/v1/expressions", query: [.init(name: "q", value: query)], as: LabelsResponse.self).expressions
    }

    func imageData(path: String) async throws -> Data {
        let (data, response) = try await Self.send(request(path: "api/images/\(path)"))
        try Self.check(response, data)
        return data
    }

    // MARK: Writes

    func createBottle(_ bottle: NewBottle) async throws -> Int {
        var req = request(path: "api/v1/bottles")
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(bottle)
        let (data, response) = try await Self.send(req)
        try Self.check(response, data)
        return try Self.decoder.decode(CreatedBottle.self, from: data).id
    }

    /// Multipart upload to the web route; the first photo becomes the bottle's hero shot.
    func uploadImages(bottleId: Int, jpegs: [Data]) async throws {
        let boundary = "rickhouse-\(UUID().uuidString)"
        var req = request(path: "api/bottles/\(bottleId)/images")
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        for (index, jpeg) in jpegs.enumerated() {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"images\"; filename=\"photo-\(index).jpg\"\r\n".utf8))
            body.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
            body.append(jpeg)
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))

        let (data, response) = try await Self.send(req, body: body)
        try Self.check(response, data)
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           object["ok"] as? Bool == false {
            throw APIError.server(object["error"] as? String ?? "The photo wasn't saved.")
        }
    }

    // MARK: Plumbing

    private func request(path: String, query: [URLQueryItem] = []) -> URLRequest {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var req = URLRequest(url: components.url!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return req
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type) async throws -> T {
        let (data, response) = try await Self.send(request(path: path, query: query))
        try Self.check(response, data)
        return try Self.decoder.decode(T.self, from: data)
    }

    private static func send(_ request: URLRequest, body: Data? = nil) async throws -> (Data, URLResponse) {
        do {
            if let body { return try await URLSession.shared.upload(for: request, from: body) }
            return try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
    }

    private static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.badServer }
        switch http.statusCode {
        case 200..<300: return
        case 401: throw APIError.unauthorized
        default: throw APIError.server(message(from: data) ?? "The server answered \(http.statusCode).")
        }
    }

    /// `{ "error": { "message": … } }` from /api/v1, or Better Auth's `{ "message": … }`.
    private static func message(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let error = object["error"] as? [String: Any] { return error["message"] as? String }
        return object["message"] as? String
    }
}
