import XCTest
@testable import Rickhouse

/// The screen model against the URLProtocol stub: what each draft action sends, and what a failure does.
@MainActor
final class TournamentModelTests: XCTestCase {
    private var saved: URLSession!

    private struct MemoryZoom: ZoomStore {
        func level(forTournament id: Int) -> ZoomLevel { .detail }
        func set(_ level: ZoomLevel, forTournament id: Int) {}
    }

    override func setUp() {
        saved = APIClient.session
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        APIClient.session = URLSession(configuration: config)
        StubURLProtocol.reset()
    }

    override func tearDown() { APIClient.session = saved }

    private func json(name: String) -> Data {
        Data("""
        {"id":3,"name":"\(name)","status":"draft","heatSize":2,"seeding":"similar","groupOrder":["proof","mashbill","distillery","age","finish"],
         "blind":false,"fieldNote":null,"createdAt":"x","startedAt":null,"completedAt":null,
         "entries":[{"id":1,"name":"A","status":"active","kind":"bottle","bottleId":1,"expressionId":1},
                    {"id":2,"name":"B","status":"active","kind":"bottle","bottleId":2,"expressionId":2}],
         "rounds":[{"round":1,"heats":[{"id":10,"round":1,"slot":1,"status":"pending","label":null,"autoLabel":"Rye","band":"","hidden":false,
           "entryCount":2,"glasses":[],"entries":[
            {"entryId":1,"name":"A","place":null,"glass":null,"proof":90,"mashbill":null,"ageYears":null,"distilleries":[]},
            {"entryId":2,"name":"B","place":null,"glass":null,"proof":91,"mashbill":null,"ageYears":null,"distilleries":[]}]}]}],
         "plan":[],"currentRound":null,"progress":{"done":0,"total":0},"standings":[],"champion":null}
        """.utf8)
    }

    private func model(signedIn: Bool = true) -> TournamentModel {
        let m = TournamentModel(id: 3, zoomStore: MemoryZoom())
        if signedIn { m.api = { APIClient(baseURL: URL(string: "https://rickhouse.example.com")!, token: "tok") } }
        return m
    }

    private func loaded(_ name: String = "Spring") async -> TournamentModel {
        StubURLProtocol.reply = json(name: name)
        let m = model()
        await m.load()
        StubURLProtocol.sent = []
        return m
    }

    private func lastSent(_ line: UInt = #line) throws -> StubURLProtocol.Sent { try XCTUnwrap(StubURLProtocol.sent.last, line: line) }

    func testNothingIsLoadedUntilTheFirstFetchFinishes() {
        let m = model()
        XCTAssertFalse(m.hasLoaded)
        XCTAssertNil(m.view)
        XCTAssertNil(m.bracket)
    }

    func testLoadAdoptsTheViewAndItsBracket() async {
        let m = await loaded()
        XCTAssertTrue(m.hasLoaded)
        XCTAssertEqual(m.view?.name, "Spring")
        XCTAssertEqual(m.bracket?.columns.count, 1)
        XCTAssertNil(m.loadError)
    }

    func testFirstLoadFailureIsTheErrorNotTheFootBar() async {
        StubURLProtocol.status = 404
        StubURLProtocol.reply = Data("{\"error\":{\"code\":\"not_found\",\"message\":\"No such tournament.\"}}".utf8)
        let m = model()
        await m.load()
        XCTAssertFalse(m.hasLoaded)
        XCTAssertNotNil(m.loadError)
        XCTAssertNil(m.foot.failure)
    }

    func testLaterLoadFailureKeepsThePageAndOffersRetry() async {
        let m = await loaded()
        StubURLProtocol.status = 500
        await m.load()
        XCTAssertEqual(m.view?.name, "Spring")
        XCTAssertNil(m.loadError)
        XCTAssertNotNil(m.foot.failure)
    }

    func testMoveSendsTheTargetFlightAndTakesTheAnswer() async throws {
        let m = await loaded()
        StubURLProtocol.reply = json(name: "After move")
        await m.move(entryId: 1, toHeatId: 11)
        let s = try lastSent()
        XCTAssertEqual([s.method, s.path], ["POST", "/api/v1/tournaments/3/entries/1/move"])
        XCTAssertEqual(s.body?["toHeatId"] as? Int, 11)
        XCTAssertEqual(m.view?.name, "After move")
        XCTAssertFalse(m.pending)
    }

    func testSwapSendsTheOtherEntry() async throws {
        let m = await loaded()
        let result = await m.swap(entryId: 1, with: 2)
        XCTAssertEqual(result, .done)
        let s = try lastSent()
        XCTAssertEqual(s.path, "/api/v1/tournaments/3/entries/1/swap")
        XCTAssertEqual(s.body?["withEntryId"] as? Int, 2)
    }

    func testRenameSendsNullToClearTheName() async throws {
        let m = await loaded()
        _ = await m.rename(heatId: 10, label: nil)
        let s = try lastSent()
        XCTAssertEqual([s.method, s.path], ["PATCH", "/api/v1/tournaments/3/heats/10"])
        XCTAssertTrue(s.body?["label"] is NSNull)
        _ = await m.rename(heatId: 10, label: "Rye night")
        XCTAssertEqual(try lastSent().body?["label"] as? String, "Rye night")
    }

    func testASlowLoadThatFinishesAfterAChangeDoesNotOverwriteIt() async throws {
        let m = await loaded("Old")
        StubURLProtocol.queue = [(status: 200, body: json(name: "Stale"))]
        StubURLProtocol.delays = [0.3]
        StubURLProtocol.reply = json(name: "Fresh")
        let slow = Task { await m.load() }
        try await Task.sleep(for: .milliseconds(80))
        _ = await m.rename(heatId: 10, label: "Rye night")
        XCTAssertEqual(m.view?.name, "Fresh")
        await slow.value
        XCTAssertEqual(m.view?.name, "Fresh", "the load began before the change, so its answer is dropped")
    }

    func testALoadAfterAChangeIsKept() async {
        let m = await loaded("Old")
        StubURLProtocol.reply = json(name: "Fresh")
        _ = await m.rename(heatId: 10, label: nil)
        StubURLProtocol.reply = json(name: "Newest")
        await m.load()
        XCTAssertEqual(m.view?.name, "Newest")
    }

    func testStartResetAndPatchShapes() async throws {
        let m = await loaded()
        await m.start()
        XCTAssertEqual(try lastSent().path, "/api/v1/tournaments/3/start")
        await m.reset()
        XCTAssertEqual(try lastSent().path, "/api/v1/tournaments/3/reset")
        await m.patch(TournamentPatch(name: "Renamed", heatSize: 3))
        let s = try lastSent()
        XCTAssertEqual([s.method, s.path], ["PATCH", "/api/v1/tournaments/3"])
        XCTAssertEqual(s.body?["name"] as? String, "Renamed")
        XCTAssertEqual(s.body?["heatSize"] as? Int, 3)
    }

    func testAFailedMoveLoadsTheViewAgainAndOffersRetryInTheFootBar() async throws {
        let m = await loaded("Before")
        StubURLProtocol.queue = [(409, Data("{\"error\":{\"code\":\"conflict\",\"message\":\"That flight is full.\"}}".utf8)),
                                 (200, json(name: "Fresh"))]
        await m.move(entryId: 1, toHeatId: 11)
        XCTAssertEqual(StubURLProtocol.sent.map(\.method), ["POST", "GET"], "the page is fetched again after the failure")
        XCTAssertEqual(m.view?.name, "Fresh")
        XCTAssertEqual(m.foot.failure?.message, "That flight is full.")
        XCTAssertFalse(m.pending)
    }

    func testAFailedSheetActionIsReturnedNotShownInTheFootBar() async {
        let m = await loaded()
        StubURLProtocol.queue = [(422, Data("{\"error\":{\"code\":\"invalid\",\"message\":\"Check the form.\",\"fields\":{\"name\":\"Too long.\"}}}".utf8)),
                                 (200, json(name: "Fresh"))]
        let result = await m.patch(TournamentPatch(name: "x"), inline: true)
        XCTAssertEqual(result, .failed(message: "Check the form.", fields: ["name": "Too long."]))
        XCTAssertNil(m.foot.failure)
        XCTAssertEqual(m.view?.name, "Fresh")
    }

    func testUndoSendsDeleteToTheResultAndTakesTheAnswer() async throws {
        let m = await loaded()
        StubURLProtocol.reply = json(name: "After undo")
        await m.undo(heatId: 10)
        let s = try lastSent()
        XCTAssertEqual([s.method, s.path], ["DELETE", "/api/v1/tournaments/3/heats/10/result"])
        XCTAssertEqual(m.view?.name, "After undo")
    }

    func testWithdrawPostsToTheEntry() async throws {
        let m = await loaded()
        await m.withdraw(entryId: 2)
        let s = try lastSent()
        XCTAssertEqual([s.method, s.path], ["POST", "/api/v1/tournaments/3/entries/2/withdraw"])
    }

    func testAFailedUndoShowsTheServersReasonAndLoadsTheViewAgain() async {
        let m = await loaded("Before")
        StubURLProtocol.queue = [(409, Data("{\"error\":{\"code\":\"conflict\",\"message\":\"A later round has a result.\"}}".utf8)),
                                 (200, json(name: "Fresh"))]
        await m.undo(heatId: 10)
        XCTAssertEqual(StubURLProtocol.sent.map(\.method), ["DELETE", "GET"])
        XCTAssertEqual(m.view?.name, "Fresh")
        XCTAssertEqual(m.foot.failure?.message, "A later round has a result.")
    }

    func testAFailedWithdrawLoadsTheViewAgain() async {
        let m = await loaded("Before")
        StubURLProtocol.queue = [(404, Data("{\"error\":{\"code\":\"not_found\",\"message\":\"No such entry.\"}}".utf8)),
                                 (200, json(name: "Fresh"))]
        await m.withdraw(entryId: 9)
        XCTAssertEqual(m.view?.name, "Fresh")
        XCTAssertEqual(m.foot.failure?.message, "No such entry.")
    }

    private let drawn = Data("""
    {"heatId":10,"round":1,"slot":1,"band":"90 to 94 proof","glasses":[{"glass":"A","entry":{"entryId":1,"name":"A","proof":90,"mashbill":null,"ageYears":null,"distilleries":[]}}]}
    """.utf8)

    func testDrawPostsAnEmptyBodyAndHandsTheFlightOn() async throws {
        let m = await loaded()
        StubURLProtocol.reply = drawn
        var got: DrawnHeat?
        await m.draw { got = $0 }
        let s = try lastSent()
        XCTAssertEqual([s.method, s.path], ["POST", "/api/v1/tournaments/3/draw"])
        XCTAssertNil(s.body?["heatId"])
        XCTAssertEqual(got?.heatId, 10)
        XCTAssertFalse(m.pending)
    }

    func testAFailedDrawStaysOnTheScreenWithRetryAndLoadsTheViewAgain() async {
        let m = await loaded("Before")
        StubURLProtocol.queue = [(409, Data("{\"error\":{\"code\":\"conflict\",\"message\":\"Nothing left to draw.\"}}".utf8)),
                                 (200, json(name: "Fresh"))]
        var opened = false
        await m.draw { _ in opened = true }
        XCTAssertFalse(opened)
        XCTAssertEqual(m.view?.name, "Fresh")
        XCTAssertEqual(m.foot.failure?.message, "Nothing left to draw.")
    }

    func testResetFailureLoadsTheViewAgain() async {
        let m = await loaded("Before")
        StubURLProtocol.queue = [(500, Data("{}".utf8)), (200, json(name: "Fresh"))]
        await m.reset()
        XCTAssertEqual(m.view?.name, "Fresh")
        XCTAssertNotNil(m.foot.failure)
    }

    func testNotSignedInSendsNothing() async {
        let m = model(signedIn: false)
        let result = await m.swap(entryId: 1, with: 2)
        XCTAssertEqual(result, .failed(message: "Not signed in.", fields: [:]))
        XCTAssertTrue(StubURLProtocol.sent.isEmpty)
    }

    func testZoomIsRemembered() {
        let defaults = UserDefaults(suiteName: "TournamentModelTests")!
        defaults.removePersistentDomain(forName: "TournamentModelTests")
        let store = UserDefaultsZoomStore(defaults: defaults)
        let m = TournamentModel(id: 7, zoomStore: store)
        XCTAssertEqual(m.zoom, .detail)
        m.setZoom(.map)
        XCTAssertEqual(TournamentModel(id: 7, zoomStore: store).zoom, .map)
        XCTAssertEqual(TournamentModel(id: 8, zoomStore: store).zoom, .detail)
    }
}
