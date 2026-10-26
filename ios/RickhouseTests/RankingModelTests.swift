import XCTest
@testable import Rickhouse

/// The ranking screen's model against the URLProtocol stub, and the label's `tournamentRank` decoding.
@MainActor
final class RankingModelTests: StubbedSessionTestCase {
    private let ranking = """
    {"competitors":[{"id":"b:1","name":"Old Forester 100","bottleId":1,"expressionId":1,"rating":8.5,"theta":1.2,"rank":1,"heats":4,"provisional":false,"singleBand":false,"group":1,"groupSize":2},
                    {"id":"b:2","name":"Buffalo Trace","bottleId":2,"expressionId":2,"rating":9.0,"theta":0.1,"rank":2,"heats":4,"provisional":false,"singleBand":false,"group":1,"groupSize":2}],
     "audit":[{"id":"b:2","name":"Buffalo Trace","rating":9.0,"rank":2,"groupSize":2,"expectedRank":1,"gap":1}]}
    """
    private let categories = #"{"categories":[{"id":1,"name":"Bourbon","parent":"Whiskey"},{"id":2,"name":"Rye","parent":"Whiskey"}]}"#

    private func model() -> RankingModel {
        let m = RankingModel()
        m.api = { APIClient(baseURL: URL(string: "https://rickhouse.example.com")!, token: "tok") }
        return m
    }

    /// Answers by path, so the ranking and the categories can load in either order.
    private func answerBoth(ranking r: String? = nil) {
        StubURLProtocol.reply = Data((r ?? ranking).utf8)
    }

    func testNothingIsShownBeforeTheFirstFetchFinishes() {
        let m = RankingModel()
        XCTAssertFalse(m.hasLoaded)
        XCTAssertNil(m.result)
        XCTAssertNil(m.empty)
        XCTAssertTrue(m.sections.isEmpty)
    }

    func testLoadFetchesTheRankingWithNoCategory() async throws {
        answerBoth()
        let m = model()
        await m.load()
        XCTAssertTrue(m.hasLoaded)
        XCTAssertEqual(m.sections.first?.rows.map(\.name), ["Old Forester 100", "Buffalo Trace"])
        let sent = try XCTUnwrap(StubURLProtocol.sent.first { $0.path.hasSuffix("/tournaments/ranking") })
        XCTAssertNil(sent.query)
    }

    func testChoosingACategoryAsksAgainWithItsId() async throws {
        answerBoth()
        let m = model()
        await m.load()
        StubURLProtocol.sent = []
        await m.choose(categoryId: 2)
        XCTAssertEqual(m.categoryId, 2)
        let sent = try XCTUnwrap(StubURLProtocol.sent.last)
        XCTAssertEqual(sent.query, "categoryId=2")
        await m.choose(categoryId: nil)
        XCTAssertNil(m.categoryId)
        XCTAssertNil(StubURLProtocol.sent.last?.query)
    }

    func testFirstLoadFailureIsAnErrorNotAnEmptyRanking() async {
        StubURLProtocol.status = 500
        StubURLProtocol.reply = Data(#"{"error":{"code":"server","message":"Down for now"}}"#.utf8)
        let m = model()
        await m.load()
        XCTAssertFalse(m.hasLoaded)
        XCTAssertNotNil(m.loadError)
        XCTAssertNil(m.empty)
    }

    func testAFailedReloadKeepsWhatIsOnScreenAndOffersRetry() async {
        answerBoth()
        let m = model()
        await m.load()
        StubURLProtocol.status = 500
        StubURLProtocol.reply = Data(#"{"error":{"code":"server","message":"Down for now"}}"#.utf8)
        await m.load()
        XCTAssertTrue(m.hasLoaded)
        XCTAssertNil(m.loadError)
        XCTAssertEqual(m.sections.first?.rows.count, 2)
        XCTAssertNotNil(m.foot.failure)
    }

    func testAFailedCategoryChangeKeepsTheCategoryTheRankingIsFor() async {
        answerBoth()
        let m = model()
        await m.load()
        StubURLProtocol.status = 500
        StubURLProtocol.reply = Data(#"{"error":{"code":"server","message":"Down for now"}}"#.utf8)
        await m.choose(categoryId: 1)
        XCTAssertNil(m.categoryId)
        XCTAssertEqual(m.sections.first?.rows.count, 2)
        XCTAssertNotNil(m.foot.failure)
    }

    func testEmptyTextNamesTheCategoryOnlyWhenOneIsChosen() async {
        answerBoth(ranking: #"{"competitors":[],"audit":[]}"#)
        let m = model()
        await m.load()
        XCTAssertEqual(m.empty, .noFlights)
        XCTAssertEqual(m.noFlightsText, "No decided flights yet. Play a tournament to build a ranking.")
        await m.choose(categoryId: 1)
        XCTAssertEqual(m.noFlightsText, "No decided flights in this category yet.")
    }

    func testTheCategoryRowSaysAllUntilOneIsChosen() async {
        let m = model()
        m.categories = [CategoryOption(id: 1, name: "Bourbon", parent: "Whiskey")]
        XCTAssertEqual(m.categoryName, "All categories")
        XCTAssertEqual(m.categoryOptions.map(\.title), ["All categories", "Bourbon"])
        m.categoryId = 1
        XCTAssertEqual(m.categoryName, "Bourbon")
    }

    func testAuditNeedsRatingsAndGapsBeforeItListsAnything() async {
        answerBoth(ranking: ranking.replacingOccurrences(of: #""rating":8.5"#, with: #""rating":null"#).replacingOccurrences(of: #""rating":9.0,"theta"#, with: #""rating":null,"theta"#))
        let m = model()
        await m.load()
        XCTAssertEqual(m.empty, .noRatings)
    }

    func testTournamentRankDecodesPresentNullAndAbsent() throws {
        func detail(_ extra: String) throws -> LabelDetail {
            let base = #"{"id":1,"wheel":null,"brandId":1,"categoryId":1,"brand":"B","name":"N","category":"Bourbon","upc":null,"proof":"90","ageStatement":null,"ageYears":null,"sizeMl":750,"msrp":null,"photoPath":null,"photoThumbPath":null,"distilleries":[],"finishes":[],"mashbills":[],"releases":[],"bottles":[],"tastings":[],"links":null"#
            return try JSONDecoder().decode(LabelDetail.self, from: Data((base + extra + "}").utf8))
        }
        let present = try detail(#","tournamentRank":{"rank":3,"of":12,"text":"Tournament rank: 3 of 12 bourbons","categoryId":1}"#)
        XCTAssertEqual(present.tournamentRank, TournamentRankLine(rank: 3, of: 12, text: "Tournament rank: 3 of 12 bourbons", categoryId: 1))
        XCTAssertNil(try detail(#","tournamentRank":null"#).tournamentRank)
        XCTAssertNil(try detail("").tournamentRank)
    }
}
