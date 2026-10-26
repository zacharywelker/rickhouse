import Foundation
import Synchronization

/// Answers every request from the state below and records what was sent. The statics are read by the test thread and
/// written by URLSession's loading thread, so they live behind one lock; the accessors keep call sites as plain properties.
final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    struct Sent { let method: String; let path: String; let query: String?; let body: [String: Any]?; let auth: String? }

    private struct State {
        var sent: [Sent] = []
        var status = 200
        var reply = Data("{}".utf8)
        var versionHeader: String? = "1"
        var queue: [(status: Int, body: Data)] = []
        var delays: [TimeInterval] = []
    }

    private static let state = Mutex(State())

    static var sent: [Sent] { get { state.withLock { $0.sent } } set { state.withLock { $0.sent = newValue } } }
    static var status: Int { get { state.withLock { $0.status } } set { state.withLock { $0.status = newValue } } }
    static var reply: Data { get { state.withLock { $0.reply } } set { state.withLock { $0.reply = newValue } } }
    static var versionHeader: String? { get { state.withLock { $0.versionHeader } } set { state.withLock { $0.versionHeader = newValue } } }

    /// Answers given first, one per request, before `status`/`reply` take over (a failed change, then the reload).
    static var queue: [(status: Int, body: Data)] { get { state.withLock { $0.queue } } set { state.withLock { $0.queue = newValue } } }

    /// Seconds each request waits before it is answered, one per request in order (a slow load that finishes after a change).
    static var delays: [TimeInterval] { get { state.withLock { $0.delays } } set { state.withLock { $0.delays = newValue } } }

    static func reset() { state.withLock { $0 = State() } }

    /// The delayed answer, kept so `stopLoading()` can cancel it instead of replying to a request that is already gone.
    private let pending = Mutex<Task<Void, Never>?>(nil)

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var body: [String: Any]?
        if let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            stream.close()
            body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        } else if let data = request.httpBody {
            body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }
        guard let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let sent = Sent(method: request.httpMethod ?? "GET", path: url.path, query: url.query, body: body,
                        auth: request.value(forHTTPHeaderField: "Authorization"))
        // One lock for the whole step, so the answer chosen matches the request recorded.
        let (next, wait, version) = Self.state.withLock { s in
            s.sent.append(sent)
            let next = s.queue.isEmpty ? (status: s.status, body: s.reply) : s.queue.removeFirst()
            return (next, s.delays.isEmpty ? 0 : s.delays.removeFirst(), s.versionHeader)
        }
        var headers = ["Content-Type": "application/json"]
        if let version { headers["x-rickhouse-api"] = version }
        guard let response = HTTPURLResponse(url: url, statusCode: next.status, httpVersion: nil, headerFields: headers) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        let answer = { [self] in
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: next.body)
            client?.urlProtocolDidFinishLoading(self)
        }
        if wait > 0 {
            pending.withLock {
                $0 = Task {
                    try? await Task.sleep(for: .seconds(wait))
                    if !Task.isCancelled { answer() }
                }
            }
        } else {
            answer()
        }
    }

    override func stopLoading() { pending.withLock { $0?.cancel() } }
}
