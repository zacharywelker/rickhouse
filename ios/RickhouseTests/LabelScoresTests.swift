import XCTest
@testable import Rickhouse

final class LabelScoresTests: XCTestCase {
    private func tasting(_ id: Int, _ on: String, _ rating: String?, _ tags: [String] = []) throws -> LabelTasting {
        var json: [String: Any] = ["id": id, "tastedOn": on, "tags": tags]
        if let rating { json["rating"] = rating }
        return try JSONDecoder().decode(LabelTasting.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testUnscoredTastingsCountButDoNotMoveTheAverage() throws {
        let scores = LabelScores([
            try tasting(3, "2026-10-03", "8.5"),
            try tasting(2, "2026-06-01", nil),
            try tasting(1, "2026-01-05", "7.0"),
        ])
        XCTAssertEqual(scores.count, 3)
        XCTAssertEqual(scores.average, 7.8)
        XCTAssertEqual(scores.low, 7)
        XCTAssertEqual(scores.high, 8.5)
        XCTAssertEqual(scores.caption, "average of 2 · range 7 to 8.5")
    }

    func testPointsRunOldestFirstAndSkipUnscored() throws {
        let scores = LabelScores([
            try tasting(3, "2026-10-03", "8"),
            try tasting(2, "2026-06-01", nil),
            try tasting(1, "2026-01-05", "7"),
        ])
        XCTAssertEqual(scores.points.map(\.id), [1, 3])
        XCTAssertTrue(scores.showsTrend)
    }

    func testFewerThanThreeTastingsShowNoTrend() throws {
        let scores = LabelScores([try tasting(2, "2026-02-01", "9"), try tasting(1, "2026-01-01", "9")])
        XCTAssertFalse(scores.showsTrend)
        XCTAssertEqual(scores.caption, "average of 2")
    }

    func testNoScoresMeansNoAverage() throws {
        let scores = LabelScores([try tasting(1, "2026-01-01", nil)])
        XCTAssertNil(scores.average)
        XCTAssertTrue(scores.points.isEmpty)
    }

    func testFlavorsAreMostNotedFirstWithTiesInFirstNotedOrder() throws {
        let scores = LabelScores([
            try tasting(3, "2026-10-03", "8", ["caramel", "oak", "orange_peel"]),
            try tasting(2, "2026-07-19", "8", ["toffee", "caramel"]),
            try tasting(1, "2026-01-05", "7", ["oak", "caramel", "vanilla"]),
        ], flavorLimit: 3)
        XCTAssertEqual(scores.flavors, [.init(key: "caramel", count: 3), .init(key: "oak", count: 2), .init(key: "orange_peel", count: 1)])
    }
}
