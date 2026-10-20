import XCTest
@testable import Rickhouse

/// Answers every request from a closure and records what was sent.
final class StubURLProtocol: URLProtocol {
    struct Sent { let method: String; let path: String; let query: String?; let body: [String: Any]?; let auth: String? }

    nonisolated(unsafe) static var sent: [Sent] = []
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var reply = Data("{}".utf8)
    nonisolated(unsafe) static var versionHeader: String? = "1"

    /// Answers given first, one per request, before `status`/`reply` take over (a failed change, then the reload).
    nonisolated(unsafe) static var queue: [(status: Int, body: Data)] = []

    /// Seconds each request waits before it is answered, one per request in order (a slow load that finishes after a change).
    nonisolated(unsafe) static var delays: [TimeInterval] = []

    static func reset() { sent = []; status = 200; reply = Data("{}".utf8); versionHeader = "1"; queue = []; delays = [] }

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
        let url = request.url!
        Self.sent.append(.init(method: request.httpMethod ?? "GET", path: url.path, query: url.query, body: body,
                               auth: request.value(forHTTPHeaderField: "Authorization")))
        var headers = ["Content-Type": "application/json"]
        if let v = Self.versionHeader { headers["x-rickhouse-api"] = v }
        let next = Self.queue.isEmpty ? (status: Self.status, body: Self.reply) : Self.queue.removeFirst()
        let response = HTTPURLResponse(url: url, statusCode: next.status, httpVersion: nil, headerFields: headers)!
        let wait = Self.delays.isEmpty ? 0 : Self.delays.removeFirst()
        let answer = { [self] in
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: next.body)
            client?.urlProtocolDidFinishLoading(self)
        }
        if wait > 0 { DispatchQueue.global().asyncAfter(deadline: .now() + wait, execute: answer) } else { answer() }
    }

    override func stopLoading() {}
}

final class TournamentAPITests: XCTestCase {
    private let api = APIClient(baseURL: URL(string: "https://rickhouse.example.com")!, token: "tok")
    private var saved: URLSession!

    override func setUp() {
        saved = APIClient.session
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        APIClient.session = URLSession(configuration: config)
        StubURLProtocol.reset()
    }

    override func tearDown() { APIClient.session = saved }

    private func answer(_ json: String, status: Int = 200) {
        StubURLProtocol.reply = Data(json.utf8)
        StubURLProtocol.status = status
    }

    private var view: String {
        """
        {"id":3,"name":"Spring","status":"draft","heatSize":4,"seeding":"similar","groupOrder":["proof","mashbill","distillery","age","finish"],
         "blind":false,"fieldNote":null,"createdAt":"2026-10-01T12:00:00.000Z","startedAt":null,"completedAt":null,
         "entries":[],"rounds":[],"plan":[],"currentRound":null,"progress":{"done":0,"total":0},"standings":[],"champion":null}
        """
    }

    private func last(file: StaticString = #filePath, line: UInt = #line) throws -> StubURLProtocol.Sent {
        try XCTUnwrap(StubURLProtocol.sent.last, file: file, line: line)
    }

    private func expect(_ method: String, _ path: String, body: [String: Any]? = nil, query: String? = nil,
                        file: StaticString = #filePath, line: UInt = #line) throws {
        let sent = try last(file: file, line: line)
        XCTAssertEqual(sent.method, method, file: file, line: line)
        XCTAssertEqual(sent.path, path, file: file, line: line)
        XCTAssertEqual(sent.query, query, file: file, line: line)
        XCTAssertEqual(sent.auth, "Bearer tok", file: file, line: line)
        XCTAssertEqual(sent.body.map { NSDictionary(dictionary: $0) }, body.map { NSDictionary(dictionary: $0) }, file: file, line: line)
    }

    func testListAndGet() async throws {
        answer("""
        {"tournaments":[{"id":3,"name":"S","status":"draft","heatSize":4,"blind":false,"entryCount":0,"currentRound":null,"totalRounds":0,
         "progress":{"done":0,"total":0},"createdAt":"x","completedAt":null}]}
        """)
        let list = try await api.tournaments()
        XCTAssertEqual(list.map(\.id), [3])
        try expect("GET", "/api/v1/tournaments")
        answer(view)
        let v = try await api.tournament(id: 3)
        XCTAssertEqual(v.name, "Spring")
        try expect("GET", "/api/v1/tournaments/3")
    }

    func testCreateSendsOnlySetSettingsAndTheEntries() async throws {
        answer("{\"id\":12}", status: 201)
        let id = try await api.createTournament(NewTournament(name: "Spring", heatSize: 3, blind: true, entries: [.bottle(1), .label(2), .outside("Joe")]))
        XCTAssertEqual(id, 12)
        try expect("POST", "/api/v1/tournaments", body: [
            "name": "Spring", "heatSize": 3, "blind": true,
            "entries": [["bottleId": 1], ["expressionId": 2], ["name": "Joe"]],
        ])
    }

    func testPatchStartResetDelete() async throws {
        answer(view)
        _ = try await api.patchTournament(id: 3, TournamentPatch(groupOrder: ["age", "proof", "mashbill", "distillery", "finish"]))
        try expect("PATCH", "/api/v1/tournaments/3", body: ["groupOrder": ["age", "proof", "mashbill", "distillery", "finish"]])
        _ = try await api.startTournament(id: 3)
        try expect("POST", "/api/v1/tournaments/3/start", body: [:])
        _ = try await api.resetTournament(id: 3)
        try expect("POST", "/api/v1/tournaments/3/reset", body: [:])
        answer("{\"id\":3}")
        try await api.deleteTournament(id: 3)
        try expect("DELETE", "/api/v1/tournaments/3")
    }

    func testDrawWithAndWithoutAFlight() async throws {
        answer("{\"heatId\":5,\"round\":1,\"slot\":1,\"band\":\"\",\"glasses\":[]}")
        _ = try await api.drawFlight(tournamentId: 3)
        try expect("POST", "/api/v1/tournaments/3/draw", body: [:])
        let drawn = try await api.drawFlight(tournamentId: 3, heatId: 5)
        XCTAssertEqual(drawn.heatId, 5)
        try expect("POST", "/api/v1/tournaments/3/draw", body: ["heatId": 5])
    }

    func testRenamingAndClearingAFlightLabel() async throws {
        answer(view)
        _ = try await api.renameFlight(tournamentId: 3, heatId: 5, label: "MGP 95/5")
        try expect("PATCH", "/api/v1/tournaments/3/heats/5", body: ["label": "MGP 95/5"])
        _ = try await api.renameFlight(tournamentId: 3, heatId: 5, label: nil)
        let sent = try last()
        XCTAssertTrue(sent.body?["label"] is NSNull, "clearing sends \"label\":null, not a missing key")
        XCTAssertEqual(sent.body?.count, 1)
    }

    func testRecordUndoAndGlasses() async throws {
        answer(view)
        _ = try await api.recordFlight(tournamentId: 3, heatId: 5, ranking: [4, 3, 2, 1])
        try expect("POST", "/api/v1/tournaments/3/heats/5/result", body: ["ranking": [4, 3, 2, 1]])
        _ = try await api.recordFlight(tournamentId: 3, heatId: 5, glasses: ["B", "A"])
        try expect("POST", "/api/v1/tournaments/3/heats/5/result", body: ["glasses": ["B", "A"]])
        _ = try await api.undoFlight(tournamentId: 3, heatId: 5)
        try expect("DELETE", "/api/v1/tournaments/3/heats/5/result")
        _ = try await api.setGlasses(tournamentId: 3, heatId: 5, assign: [(entryId: 1, glass: "B"), (entryId: 2, glass: "A")])
        try expect("PUT", "/api/v1/tournaments/3/heats/5/glass", body: ["assign": [["entryId": 1, "glass": "B"], ["entryId": 2, "glass": "A"]]])
    }

    func testSixGlassBodiesCarryTheLettersEAndF() async throws {
        answer(view)
        let six = ["F", "E", "D", "C", "B", "A"]
        _ = try await api.recordFlight(tournamentId: 3, heatId: 5, glasses: six)
        try expect("POST", "/api/v1/tournaments/3/heats/5/result", body: ["glasses": six])
        _ = try await api.setGlasses(tournamentId: 3, heatId: 5, assign: [(entryId: 1, glass: "E"), (entryId: 2, glass: "F")])
        try expect("PUT", "/api/v1/tournaments/3/heats/5/glass", body: ["assign": [["entryId": 1, "glass": "E"], ["entryId": 2, "glass": "F"]]])
        answer("{\"id\":12}", status: 201)
        _ = try await api.createTournament(NewTournament(name: "Big", heatSize: 6, entries: [.outside("A"), .outside("B")]))
        try expect("POST", "/api/v1/tournaments", body: ["name": "Big", "heatSize": 6, "entries": [["name": "A"], ["name": "B"]]])
    }

    func testRemoveAnEntryAndMoveAFlight() async throws {
        answer(view)
        _ = try await api.removeEntry(tournamentId: 3, entryId: 9)
        try expect("DELETE", "/api/v1/tournaments/3/entries/9")
        XCTAssertNil(try last().body, "removing sends no body")
        _ = try await api.moveFlight(tournamentId: 3, heatId: 5, toSlot: 2)
        try expect("POST", "/api/v1/tournaments/3/heats/5/move", body: ["toSlot": 2])
    }

    func testEntryCommands() async throws {
        answer(view)
        _ = try await api.moveEntry(tournamentId: 3, entryId: 9, toHeatId: 6)
        try expect("POST", "/api/v1/tournaments/3/entries/9/move", body: ["toHeatId": 6])
        _ = try await api.swapEntries(tournamentId: 3, entryId: 9, withEntryId: 8)
        try expect("POST", "/api/v1/tournaments/3/entries/9/swap", body: ["withEntryId": 8])
        _ = try await api.withdrawEntry(tournamentId: 3, entryId: 9)
        try expect("POST", "/api/v1/tournaments/3/entries/9/withdraw", body: [:])
        _ = try await api.promoteEntry(tournamentId: 3, entryId: 9, bottleId: 4)
        try expect("PATCH", "/api/v1/tournaments/3/entries/9", body: ["bottleId": 4])
        _ = try await api.promoteEntry(tournamentId: 3, entryId: 9, expressionId: 7)
        try expect("PATCH", "/api/v1/tournaments/3/entries/9", body: ["expressionId": 7])
    }

    func testRankingAndFieldQueries() async throws {
        answer("{\"competitors\":[],\"audit\":[]}")
        _ = try await api.tournamentRanking()
        try expect("GET", "/api/v1/tournaments/ranking")
        _ = try await api.tournamentRanking(categoryId: 12)
        try expect("GET", "/api/v1/tournaments/ranking", query: "categoryId=12")
        answer("{\"rows\":[],\"total\":0}")
        _ = try await api.fieldCandidates(FieldFilters(q: "eagle rare", categoryIds: [2], opened: .open))
        try expect("GET", "/api/v1/tournaments/field", query: "q=eagle%20rare&categoryIds=2&opened=open")
        answer("{\"rows\":[]}")
        let labels = try await api.labelCandidates(matching: "elijah")
        XCTAssertTrue(labels.isEmpty)
        try expect("GET", "/api/v1/tournaments/field/labels", query: "q=elijah")
    }

    func testAConflictAndAnInvalidSurfaceTheirMessages() async throws {
        answer("{\"error\":{\"code\":\"conflict\",\"message\":\"A running tournament cannot be deleted. Finish it first.\"}}", status: 409)
        do { try await api.deleteTournament(id: 3); XCTFail("should throw") }
        catch { XCTAssertEqual(error.localizedDescription, "A running tournament cannot be deleted. Finish it first.") }

        answer("{\"error\":{\"code\":\"invalid\",\"message\":\"Rank every bottle exactly once.\",\"fields\":{\"ranking\":\"Rank every bottle exactly once.\"}}}", status: 422)
        do { _ = try await api.recordFlight(tournamentId: 3, heatId: 5, ranking: [1]); XCTFail("should throw") }
        catch APIError.invalid(let code, let message, let fields) {
            XCTAssertEqual(code, "invalid")
            XCTAssertEqual(message, "Rank every bottle exactly once.")
            XCTAssertEqual(fields["ranking"], "Rank every bottle exactly once.")
        }

        answer("{\"error\":{\"code\":\"not_found\",\"message\":\"That tournament is gone.\"}}", status: 404)
        do { _ = try await api.tournament(id: 99); XCTFail("should throw") }
        catch { XCTAssertEqual(error.localizedDescription, "That tournament is gone.") }
    }

    func testAMissingVersionHeaderIsRefused() async throws {
        StubURLProtocol.versionHeader = nil
        answer("{\"tournaments\":[]}")
        do { _ = try await api.tournaments(); XCTFail("should throw") }
        catch APIError.serverTooOld {}
    }
}
