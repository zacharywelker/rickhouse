import XCTest
@testable import Rickhouse

/// The play model against the URLProtocol stub: what each step sends, and what a failure keeps.
@MainActor
final class TournamentPlayModelTests: XCTestCase {
    private var saved: URLSession!

    override func setUp() {
        saved = APIClient.session
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        APIClient.session = URLSession(configuration: config)
        StubURLProtocol.reset()
    }

    override func tearDown() { APIClient.session = saved }

    /// Heat 10 of a running tournament with Alpha (100 proof) and Beta (90): pending, or decided with Beta first.
    private func view(blind: Bool = false, decided: Bool = false, hidden: Bool = false, status: String = "active") -> Data {
        func entry(_ id: Int, _ name: String, _ proof: Int, _ place: Int?) -> String {
            """
            {"entryId":\(id),"name":"\(name)","place":\(place.map(String.init) ?? "null"),"glass":null,"proof":\(proof),"mashbill":null,"ageYears":4,"distilleries":[]}
            """
        }
        let entries = hidden ? "" : [entry(1, "Alpha", 100, decided ? 2 : nil), entry(2, "Beta", 90, decided ? 1 : nil)].joined(separator: ",")
        return Data("""
        {"id":3,"name":"Spring","status":"\(decided ? "complete" : status)","heatSize":2,"seeding":"similar","groupOrder":["proof"],
         "blind":\(blind),"fieldNote":null,"createdAt":"x","startedAt":"x","completedAt":null,
         "entries":[{"id":1,"name":"Alpha","status":"active","kind":"bottle","bottleId":1,"expressionId":1},
                    {"id":2,"name":"Beta","status":"active","kind":"bottle","bottleId":2,"expressionId":2}],
         "rounds":[{"round":1,"heats":[{"id":10,"round":1,"slot":1,"status":"\(decided ? "decided" : "pending")","label":null,
           "autoLabel":\(hidden ? "null" : "\"Bourbon\""),"band":"90 to 100 proof","hidden":\(hidden),"entryCount":2,"glasses":[],"entries":[\(entries)]}]}],
         "plan":[1],"currentRound":\(decided ? "null" : "1"),"progress":{"done":\(decided ? 1 : 0),"total":1},"standings":[],
         "champion":\(decided ? "{\"entryId\":2,\"name\":\"Beta\"}" : "null")}
        """.utf8)
    }

    private func drawn() -> DrawnHeat {
        let json = """
        {"heatId":10,"round":1,"slot":1,"band":"90 to 100 proof","glasses":[
         {"glass":"A","entry":{"entryId":1,"name":"Alpha","proof":100,"mashbill":null,"ageYears":4,"distilleries":[]}},
         {"glass":"B","entry":{"entryId":2,"name":"Beta","proof":90,"mashbill":null,"ageYears":4,"distilleries":[]}}]}
        """
        return try! JSONDecoder().decode(DrawnHeat.self, from: Data(json.utf8))
    }

    private func model(drawn: DrawnHeat? = nil) -> PlayModel {
        let m = PlayModel(tournamentID: 3, heatID: 10, drawn: drawn)
        m.api = { APIClient(baseURL: URL(string: "https://rickhouse.example.com")!, token: "tok") }
        return m
    }

    private func loaded(blind: Bool = false, drawn: DrawnHeat? = nil, hidden: Bool = false) async -> PlayModel {
        StubURLProtocol.reply = view(blind: blind, hidden: hidden)
        let m = model(drawn: drawn)
        await m.load()
        StubURLProtocol.sent = []
        return m
    }

    private func posts() -> [StubURLProtocol.Sent] { StubURLProtocol.sent.filter { $0.method != "GET" } }

    func testOpenFlightListsTheBottlesInPourOrder() async {
        let m = await loaded()
        XCTAssertEqual(m.order.map(\.name), ["Beta", "Alpha"])
        XCTAssertEqual(m.order.first?.detail, "90 proof · — · 4 yr")
        XCTAssertEqual(m.title, "Bourbon")
        XCTAssertNil(m.stopped)
    }

    func testRecordSendsTheRankingBestFirstAndRevealsThePlaces() async throws {
        let m = await loaded()
        m.move(index: 1, delta: -1)
        XCTAssertEqual(m.order.map(\.name), ["Alpha", "Beta"])
        StubURLProtocol.reply = view(decided: true)
        await m.record()
        let sent = try XCTUnwrap(posts().last)
        XCTAssertEqual(sent.path, "/api/v1/tournaments/3/heats/10/result")
        XCTAssertEqual(sent.body?["ranking"] as? [Int], [1, 2])
        XCTAssertTrue(m.revealed)
        XCTAssertEqual(m.decided?.places.map(\.name), ["Beta", "Alpha"])
        XCTAssertEqual(m.decided?.champion, "Beta")
        XCTAssertNotNil(m.foot.undo)
    }

    func testTheSecondTapWhileSendingDoesNothing() async {
        let m = await loaded()
        StubURLProtocol.reply = view(decided: true)
        async let a: Void = m.record()
        async let b: Void = m.record()
        _ = await (a, b)
        XCTAssertEqual(posts().count, 1)
    }

    func testAFailureKeepsTheRankingAndOffersRetry() async {
        let m = await loaded()
        m.move(index: 1, delta: -1)
        StubURLProtocol.queue = [(500, Data("{\"error\":{\"code\":\"server\",\"message\":\"Try later.\"}}".utf8))]
        await m.record()
        XCTAssertFalse(m.revealed)
        XCTAssertEqual(m.order.map(\.name), ["Alpha", "Beta"])
        XCTAssertEqual(m.foot.failure?.message, "Try later.")
        XCTAssertFalse(m.recording)
    }

    func testAlreadyDecidedShowsTheResult() async {
        let m = await loaded()
        StubURLProtocol.queue = [(409, Data("{\"error\":{\"code\":\"conflict\",\"message\":\"This flight already has a result.\"}}".utf8))]
        StubURLProtocol.reply = view(decided: true)
        await m.record()
        XCTAssertTrue(m.revealed)
        XCTAssertEqual(m.decided?.places.first?.name, "Beta")
        XCTAssertNil(m.foot.failure)
    }

    func testADecidedFlightIsANoticeNotARankingList() async {
        StubURLProtocol.reply = view(decided: true)
        let m = model()
        await m.load()
        XCTAssertEqual(m.stopped, .decided)
        XCTAssertTrue(m.order.isEmpty)
    }

    func testArrivingFromDrawOpensTheGlassesAtOnce() async {
        let m = await loaded(blind: true, drawn: drawn(), hidden: true)
        guard case .mapping(let rows, let saved, _) = m.flow else { return XCTFail("\(m.flow)") }
        XCTAssertEqual(rows.map(\.name), ["Alpha", "Beta"])
        XCTAssertTrue(saved)
        XCTAssertTrue(StubURLProtocol.sent.isEmpty)
    }

    func testShowTheGlassesDrawsThisFlight() async throws {
        let m = await loaded(blind: true, hidden: true)
        XCTAssertEqual(m.flow, .start)
        StubURLProtocol.reply = Data("""
        {"heatId":10,"round":1,"slot":1,"band":"b","glasses":[{"glass":"B","entry":{"entryId":1,"name":"Alpha","proof":100,"mashbill":null,"ageYears":null,"distilleries":[]}},
         {"glass":"A","entry":{"entryId":2,"name":"Beta","proof":90,"mashbill":null,"ageYears":null,"distilleries":[]}}]}
        """.utf8)
        await m.show()
        let sent = try XCTUnwrap(posts().last)
        XCTAssertEqual(sent.path, "/api/v1/tournaments/3/draw")
        XCTAssertEqual(sent.body?["heatId"] as? Int, 10)
        guard case .mapping(let rows, _, _) = m.flow else { return XCTFail("\(m.flow)") }
        XCTAssertEqual(rows.map(\.glass), ["B", "A"])
    }

    func testAFailedDrawGoesBackToStartWithRetry() async {
        let m = await loaded(blind: true, hidden: true)
        StubURLProtocol.status = 500
        StubURLProtocol.reply = Data("{\"error\":{\"code\":\"server\",\"message\":\"Nope.\"}}".utf8)
        await m.show()
        XCTAssertEqual(m.flow, .start)
        XCTAssertEqual(m.foot.failure?.message, "Nope.")
    }

    func testSaveSendsTheLettersAndHideNeedsThemSaved() async throws {
        let m = await loaded(blind: true, drawn: drawn(), hidden: true)
        m.setGlass(entryId: 1, glass: "B")
        m.hide()
        guard case .mapping = m.flow else { return XCTFail("hid with unsaved letters") }
        StubURLProtocol.reply = view(blind: true, hidden: true)
        await m.saveLetters()
        let sent = try XCTUnwrap(posts().last)
        XCTAssertEqual(sent.method, "PUT")
        XCTAssertEqual(sent.path, "/api/v1/tournaments/3/heats/10/glass")
        let assign = try XCTUnwrap(sent.body?["assign"] as? [[String: Any]])
        XCTAssertEqual(assign.map { $0["glass"] as? String }, ["B", "A"])
        m.hide()
        XCTAssertEqual(m.flow, .rank(order: ["A", "B"]))
    }

    func testAfterHideNoNameIsKeptAndRecordSendsGlassLetters() async throws {
        let m = await loaded(blind: true, drawn: drawn(), hidden: true)
        m.hide()
        let held = String(reflecting: m.flow) + m.order.map(\.name).joined()
        XCTAssertFalse(held.contains("Alpha"))
        XCTAssertFalse(held.contains("Beta"))
        m.move(index: 0, delta: 1)
        StubURLProtocol.reply = view(blind: true, decided: true)
        await m.record()
        XCTAssertEqual(try XCTUnwrap(posts().last).body?["glasses"] as? [String], ["B", "A"])
        XCTAssertNil(posts().last?.body?["ranking"])
        XCTAssertTrue(m.revealed)
    }

    func testUndoFromTheFootBarTakesTheResultBackAndLeaves() async throws {
        let m = await loaded()
        StubURLProtocol.reply = view(decided: true)
        await m.record()
        let offer = try XCTUnwrap(m.foot.undo)
        StubURLProtocol.reply = view()
        m.runUndo(offer)
        for _ in 0..<50 where !m.undone { try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertTrue(m.undone)
        XCTAssertEqual(posts().last?.method, "DELETE")
        XCTAssertEqual(posts().last?.path, "/api/v1/tournaments/3/heats/10/result")
    }
}

final class TournamentPlayLogicTests: XCTestCase {
    func testWordsAndDetails() {
        XCTAssertEqual(TournamentPlayLogic.pourTitle(4), "Pour four glasses")
        XCTAssertEqual(TournamentPlayLogic.pourTitle(1), "Pour one glass")
        XCTAssertEqual(TournamentPlayLogic.detail(nil, nil, nil), "— · — · —")
        XCTAssertEqual(TournamentPlayLogic.detail(94, "60% corn", 4.5), "94 proof · 60% corn · 4.5 yr")
        XCTAssertTrue(TournamentPlayLogic.isAlreadyDecided("This flight Already Has a Result."))
        XCTAssertFalse(TournamentPlayLogic.isAlreadyDecided("Nope."))
        XCTAssertEqual(TournamentPlayLogic.moved("Glass B", to: 0, of: 3), "Glass B, number 1 of 3")
    }
}
