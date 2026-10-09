import Foundation

enum APIError: LocalizedError {
    case badServer
    case serverNotFound
    case unauthorized
    case insecureServer
    case serverTooOld
    case appTooOld
    case server(String)
    case duplicateLabel(LabelOption)
    /// The server refused a value; `fields` names which, by the API's own field names.
    case invalid(code: String, message: String, fields: [String: String])
    /// A brand and name another of your labels already has.
    case nameTaken(existing: LabelRef)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .badServer: "That doesn't look like a server address."
        case .serverNotFound: "Can't reach that server. Check the address and try again."
        case .unauthorized: "Your session has ended. Sign in again."
        case .insecureServer: "Use an https:// address. Rickhouse only signs in over an encrypted connection."
        case .serverTooOld: "Your Rickhouse server is older than this app. Update the server."
        case .appTooOld: "Your Rickhouse server is newer than this app. Update the app."
        case .server(let message): message
        case .duplicateLabel(let label): "You already have \(label.title)."
        case .invalid(_, let message, _): message
        case .nameTaken(let existing): "You already have \(existing.title)."
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

    /// `x-rickhouse-api` versions this app understands. Within one version the
    /// server only adds fields, and Codable ignores ones it doesn't know.
    static let supportedAPIVersions = 1...1

    fileprivate static let decoder = JSONDecoder()

    // MARK: Sign in

    enum SignInOutcome {
        case signedIn(token: String, user: User)
        case needsSecondFactor(TwoFactorChallenge)
    }

    /// What the server says before sign-in: who it is and whether it can email a code.
    struct ServerInfo: Decodable {
        let app: String?
        /// Whether the server can email a two-step code. Absent on older servers, which read as no.
        let emailCodes: Bool?
    }

    /// Asks the address who it is. Any failure to reach a Rickhouse server reads
    /// the same ("can't reach"), so a typo that lands on another site is refused;
    /// only a real Rickhouse on the wrong API version says so.
    static func verifyServer(baseURL: URL) async throws -> ServerInfo {
        let data: Data, response: URLResponse
        do { (data, response) = try await send(URLRequest(url: baseURL.appending(path: "api/v1/server"))) }
        catch { throw APIError.serverNotFound }
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let info = try? decoder.decode(ServerInfo.self, from: data) else { throw APIError.serverNotFound }
        guard info.app == "rickhouse" else {
            // Servers from before the `app` field still send the version header.
            throw http.value(forHTTPHeaderField: "x-rickhouse-api") != nil ? APIError.serverTooOld : APIError.serverNotFound
        }
        try check(response, data)
        return info
    }

    /// The app has no Turnstile check; the server slows guessing instead (429 with a wait).
    static func signIn(baseURL: URL, username: String, password: String, emailCodes: Bool = false) async throws -> SignInOutcome {
        let (data, response) = try await post(baseURL, "api/v1/auth/sign-in", json: ["username": username, "password": password])
        guard let http = response as? HTTPURLResponse else { throw APIError.badServer }
        if http.statusCode == 404 { throw APIError.serverTooOld }
        guard http.statusCode == 200 else { throw APIError.server(message(from: data) ?? "Wrong username or password.") }

        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           object["twoFactorRedirect"] as? Bool == true {
            // The server ties the next step to a short-lived cookie from this response.
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: http.allHeaderFields as? [String: String] ?? [:], for: baseURL)
            let header = HTTPCookie.requestHeaderFields(with: cookies)["Cookie"] ?? ""
            guard !header.isEmpty else { throw APIError.server("The server didn't start a two-step sign-in. Is it up to date?") }
            return .needsSecondFactor(TwoFactorChallenge(baseURL: baseURL, cookie: header, emailCodes: emailCodes))
        }
        return try await finish(baseURL: baseURL, http: http)
    }

    /// Reads the token off a successful sign-in response and looks up who it is.
    fileprivate static func finish(baseURL: URL, http: HTTPURLResponse) async throws -> SignInOutcome {
        guard let token = http.value(forHTTPHeaderField: "set-auth-token") else {
            throw APIError.server("The server didn't hand back a token. Is it up to date?")
        }
        let me = try await APIClient(baseURL: baseURL, token: token).me()
        return .signedIn(token: token, user: me)
    }

    fileprivate static func post(_ baseURL: URL, _ path: String, json: [String: Any], cookie: String? = nil) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Better Auth checks Origin against the host it is served from.
        request.setValue(baseURL.absoluteString, forHTTPHeaderField: "Origin")
        // Cookies are passed by hand, so nothing leaks between sign-in attempts.
        request.httpShouldHandleCookies = false
        if let cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        request.httpBody = try JSONSerialization.data(withJSONObject: json)
        return try await send(request)
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

    /// Labels with this barcode. The server treats a UPC-A and its 13-digit EAN form as one code. An older
    /// server ignores `upc` and answers with every label, so the answer is filtered here too.
    func labels(withBarcode code: String) async throws -> [LabelOption] {
        let found = try await get("api/v1/expressions", query: [.init(name: "upc", value: code)], as: LabelsResponse.self).expressions
        let wanted = Barcode.forms(of: code)
        return found.filter { label in label.upc.map(wanted.contains) ?? false }
    }

    func tastings(page: Int) async throws -> TastingsPage {
        try await get("api/v1/tastings", query: [.init(name: "page", value: String(page)), .init(name: "size", value: "30")], as: TastingsPage.self)
    }

    func label(id: Int) async throws -> LabelDetail {
        try await get("api/v1/expressions/\(id)", as: LabelDetail.self)
    }

    /// What each step of What to drink tonight shows for the choices so far.
    func tonightOptions(categories: Set<Int>, sealed: Bool) async throws -> TonightOptions {
        var items: [URLQueryItem] = []
        if !categories.isEmpty { items.append(.init(name: "category", value: categories.sorted().map(String.init).joined(separator: ","))) }
        if sealed { items.append(.init(name: "sealed", value: "1")) }
        return try await get("api/v1/tonight", query: items, as: TonightOptions.self)
    }

    /// Draws one bottle, or nil when nothing is left that fits.
    func tonightPick(_ request: TonightPickRequest) async throws -> TonightPick? {
        try await sendJSON("POST", "api/v1/tonight/pick", body: request, as: TonightPickResponse.self).pick
    }

    /// The muted bottles still muted, with the end dates a new mute may have.
    func mutes() async throws -> MutesResponse {
        try await get("api/v1/mutes", as: MutesResponse.self)
    }

    /// Mutes a bottle until a date from `mutes().window`, or changes the date of one already muted.
    func mute(bottleId: Int, until: String) async throws {
        _ = try await sendJSON("PUT", "api/v1/bottles/\(bottleId)/mute", body: ["until": until], as: MuteAnswer.self)
    }

    func unmute(bottleId: Int) async throws {
        var req = request(path: "api/v1/bottles/\(bottleId)/mute")
        req.httpMethod = "DELETE"
        let (data, response) = try await Self.send(req)
        try Self.check(response, data)
    }

    func tastingWheels() async throws -> [TastingWheel] {
        try await get("api/v1/tasting-wheels", as: WheelsResponse.self).wheels
    }

    func categories() async throws -> [CategoryOption] {
        try await get("api/v1/categories", as: CategoriesResponse.self).categories
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

    /// Logs a tasting of one of your labels. The server checks the flavors against the label's wheel.
    func createTasting(_ tasting: TastingBody) async throws -> Int {
        try await sendJSON("POST", "api/v1/tastings", body: tasting, as: CreatedTasting.self).id
    }

    /// Replaces what a tasting says; its label and bottle stay.
    func updateTasting(id: Int, _ tasting: TastingBody) async throws {
        _ = try await sendJSON("PATCH", "api/v1/tastings/\(id)", body: tasting, as: CreatedTasting.self)
    }

    func deleteTasting(id: Int) async throws {
        var req = request(path: "api/v1/tastings/\(id)")
        req.httpMethod = "DELETE"
        let (data, response) = try await Self.send(req)
        try Self.check(response, data)
    }

    /// Starts a label. A label the brand already has comes back as `APIError.duplicateLabel`, carrying it.
    func createLabel(_ label: NewLabel) async throws -> LabelOption {
        var req = request(path: "api/v1/expressions")
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(label)
        let (data, response) = try await Self.send(req)
        if (response as? HTTPURLResponse)?.statusCode == 409,
           let existing = try? Self.decoder.decode(DuplicateAnswer.self, from: data).existing {
            throw APIError.duplicateLabel(existing)
        }
        try Self.check(response, data)
        return try Self.decoder.decode(LabelOption.self, from: data)
    }

    /// Saves a scanned barcode onto a label that has none. The server never overwrites one it has.
    func attachBarcode(labelId: Int, code: String) async throws {
        _ = try await sendJSON("PATCH", "api/v1/expressions/\(labelId)", body: ["upc": code], as: LabelOption.self)
    }

    /// Sets the fill level. The answer says what else changed: below full opens a sealed bottle.
    func setFill(bottleId: Int, to percent: Int) async throws -> FillResult {
        try await sendJSON("PATCH", "api/v1/bottles/\(bottleId)", body: ["fillPct": percent], as: FillResult.self)
    }

    /// Changes a bottle's own facts, its Opened date and/or its level in one request. A key set to NSNull clears that
    /// fact. Clearing Opened on an open bottle needs `ifOpenedCleared`; without it the server answers
    /// `APIError.invalid(code: "opened_cleared", …)`. The answer says what else changed.
    func updateBottle(id: Int, _ changes: [String: Any]) async throws -> FillResult {
        try await sendObject("PATCH", "api/v1/bottles/\(id)", json: changes, as: FillResult.self)
    }

    /// Changes a label's facts. A brand and name another label already has is `APIError.nameTaken`, carrying it.
    func updateLabel(id: Int, _ changes: [String: Any]) async throws {
        _ = try await sendObject("PATCH", "api/v1/expressions/\(id)", json: changes, as: LabelOption.self)
    }

    /// Multipart upload to the web route; the first photo becomes the bottle's hero shot.
    func uploadImages(bottleId: Int, images: [UploadImage]) async throws {
        let boundary = "rickhouse-\(UUID().uuidString)"
        var req = request(path: "api/bottles/\(bottleId)/images")
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        for (index, image) in images.enumerated() {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"images\"; filename=\"photo-\(index).\(image.ext)\"\r\n".utf8))
            body.append(Data("Content-Type: \(image.mime)\r\n\r\n".utf8))
            body.append(image.data)
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

    private func sendJSON<Body: Encodable, Answer: Decodable>(_ method: String, _ path: String, body: Body, as type: Answer.Type) async throws -> Answer {
        var req = request(path: path)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await Self.send(req)
        try Self.check(response, data)
        return try Self.decoder.decode(Answer.self, from: data)
    }

    /// A JSON object body built by hand, because a fact cleared with `null` has to be sent as `null`.
    private func sendObject<Answer: Decodable>(_ method: String, _ path: String, json: [String: Any], as type: Answer.Type) async throws -> Answer {
        var req = request(path: path)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, response) = try await Self.send(req)
        try Self.check(response, data)
        return try Self.decoder.decode(Answer.self, from: data)
    }

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

    fileprivate static func send(_ request: URLRequest, body: Data? = nil) async throws -> (Data, URLResponse) {
        do {
            if let body { return try await URLSession.shared.upload(for: request, from: body) }
            return try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
    }

    fileprivate static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.badServer }
        // Checked before the status, so a mismatch isn't misread as a decode error.
        if http.url?.path.contains("/api/v1/") == true {
            guard let raw = http.value(forHTTPHeaderField: "x-rickhouse-api"), let version = Int(raw) else {
                throw APIError.serverTooOld
            }
            if version < supportedAPIVersions.lowerBound { throw APIError.serverTooOld }
            if version > supportedAPIVersions.upperBound { throw APIError.appTooOld }
        }
        switch http.statusCode {
        case 200..<300: return
        case 401: throw APIError.unauthorized
        case 409, 422:
            if let refusal = refusal(from: data) { throw refusal }
            fallthrough
        default: throw APIError.server(message(from: data) ?? "The server answered \(http.statusCode).")
        }
    }

    /// The API's structured refusals: a name another label has (409), or a value it won't take (422), with the field.
    fileprivate static func refusal(from data: Data) -> APIError? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = object["error"] as? [String: Any],
              let code = error["code"] as? String, let message = error["message"] as? String else { return nil }
        if code == "name_taken", let existing = object["existing"] as? [String: Any],
           let id = existing["id"] as? Int, let title = existing["title"] as? String {
            return .nameTaken(existing: LabelRef(id: id, title: title))
        }
        guard code == "invalid" || code == "opened_cleared" else { return nil }
        return .invalid(code: code, message: message, fields: error["fields"] as? [String: String] ?? [:])
    }

    /// `{ "error": { "message": … } }` from /api/v1, or Better Auth's `{ "message": … }`.
    fileprivate static func message(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let error = object["error"] as? [String: Any] { return error["message"] as? String }
        return object["message"] as? String
    }
}

/// A password that was right, waiting on a second factor.
struct TwoFactorChallenge {
    let baseURL: URL
    fileprivate let cookie: String
    /// Offered only when the server says it can send mail.
    let emailCodes: Bool

    enum Method { case authenticator, backupCode, emailCode }

    func verify(_ code: String, method: Method) async throws -> APIClient.SignInOutcome {
        let path = switch method {
        case .authenticator: "api/auth/two-factor/verify-totp"
        case .backupCode: "api/auth/two-factor/verify-backup-code"
        case .emailCode: "api/auth/two-factor/verify-otp"
        }
        let (data, response) = try await APIClient.post(baseURL, path, json: ["code": code], cookie: cookie)
        guard let http = response as? HTTPURLResponse else { throw APIError.badServer }
        guard http.statusCode == 200 else {
            throw APIError.server(APIClient.message(from: data) ?? "That code didn't work.")
        }
        return try await APIClient.finish(baseURL: baseURL, http: http)
    }

    /// Emails a one-time code. Only works when the server has email set up.
    func sendEmailCode() async throws {
        let (data, response) = try await APIClient.post(baseURL, "api/auth/two-factor/send-otp", json: [:], cookie: cookie)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.server(APIClient.message(from: data) ?? "The code couldn't be sent.")
        }
    }
}
