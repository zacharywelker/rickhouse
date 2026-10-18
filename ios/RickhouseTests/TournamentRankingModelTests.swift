import XCTest
@testable import Rickhouse

// Mirrors src/lib/tournaments/__tests__/ranking-model.test.ts (parseRankingParams is a URL concern and stays on the web).
final class TournamentRankingModelTests: XCTestCase {
    private typealias R = TournamentRankingModel
    private typealias C = RankingResult.Competitor

    private func c(_ id: String, name: String? = nil, rank: Int = 1, heats: Int = 3, provisional: Bool = false, singleBand: Bool = false,
                   group: Int = 1, expressionId: Int? = nil, rating: Double? = nil) -> C {
        C(id: id, name: name ?? id, bottleId: nil, expressionId: expressionId, rating: rating, theta: 0, rank: rank, heats: heats,
          provisional: provisional, singleBand: singleBand, group: group, groupSize: 2)
    }
    private func result(_ competitors: [C], _ audit: [RankingResult.AuditRow] = []) -> RankingResult { RankingResult(competitors: competitors, audit: audit) }

    func testOrdinalHandlesTheTeensAndTheEndings() {
        XCTAssertEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(R.ordinal),
                       ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"])
    }

    func testSectionsAreEmptyWithNoCompetitors() {
        XCTAssertEqual(R.rankingSections(result([])), [])
    }

    func testTagsProvisionalAndSingleBandRowsShowsTheRatingAndLinksALabel() {
        let section = R.rankingSections(result([c("e:1", name: "A", heats: 2, provisional: true, expressionId: 1, rating: 9), c("b:2", name: "B", rank: 2, singleBand: true)]))[0]
        XCTAssertNil(section.title)
        XCTAssertEqual(section.rows[0], RankingRow(id: "e:1", rankText: "1st", name: "A", heats: 2, tags: ["Provisional"], rating: "9.0", expressionId: 1))
        XCTAssertEqual(section.rows[1], RankingRow(id: "b:2", rankText: "2nd", name: "B", heats: 3, tags: ["Single band"], rating: nil, expressionId: nil))
    }

    func testMarksASharedRankWithEquals() {
        let section = R.rankingSections(result([c("a", rank: 1), c("b", rank: 1), c("c", rank: 3)]))[0]
        XCTAssertEqual(section.rows.map(\.rankText), ["1st=", "1st=", "3rd"])
    }

    func testKeepsUnlinkedGroupsAsSeparateLabelledSectionsNeverMerged() {
        let sections = R.rankingSections(result([c("a", group: 1), c("b", rank: 2, group: 1), c("x", group: 2)]))
        XCTAssertEqual(sections.map { [$0.title ?? "", String($0.size), String($0.rows.count)] }, [["Group 1 of 2", "2", "2"], ["Group 2 of 2", "1", "1"]])
        XCTAssertTrue(sections[1].note?.lowercased().contains("not comparable") ?? false)
    }

    private func row(_ id: String, _ rating: Double, _ rank: Int, _ gap: Int) -> RankingResult.AuditRow {
        RankingResult.AuditRow(id: id, name: id, rating: rating, rank: rank, groupSize: 40, expectedRank: rank - gap, gap: gap)
    }

    func testAuditDropsZeroGapsAndSaysWhichWayItDisagrees() {
        let lines = R.auditLines(result([], [row("a", 9, 14, 12), row("b", 5, 3, -7), row("c", 7, 5, 0)]))
        XCTAssertEqual(lines.map(\.id), ["a", "b"])
        XCTAssertEqual(lines[0], AuditLine(id: "a", name: "a", text: "Rated 9.0, ranks 14th of 40", direction: .lower, verdict: "Ranks lower than your rating suggests", gap: 12))
        XCTAssertEqual(lines[1].direction, .higher)
        XCTAssertEqual(lines[1].verdict, "Ranks higher than your rating suggests")
        XCTAssertEqual(lines[1].gap, 7)
    }

    func testAuditNoteCountsWhatIsLeftOut() {
        let r = result([c("a", provisional: true, rating: 8), c("b", provisional: true), c("d", singleBand: true, rating: 7), c("e", rating: 6), c("f")])
        XCTAssertEqual(R.auditNote(r), "1 is provisional (fewer than 3 flights), 1 only met one proof band, and 2 have no rating, so they are not audited.")
    }

    func testAuditNoteUsesTheSingularForASingleLeftOutCompetitor() {
        XCTAssertEqual(R.auditNote(result([c("a", rating: 8), c("b", provisional: true, rating: 7)])), "1 is provisional (fewer than 3 flights), so it is not audited.")
    }

    func testAuditNoteIsNilWhenEverythingWasAudited() {
        XCTAssertNil(R.auditNote(result([c("a", rating: 8)])))
    }

    func testTellsNothingDecidedFromNothingRatedFromNothingToCompare() {
        XCTAssertEqual(R.rankingEmpty(result([])), .noFlights)
        XCTAssertEqual(R.rankingEmpty(result([c("a")])), .noRatings)
        XCTAssertEqual(R.rankingEmpty(result([c("a", rating: 8)])), .noGaps)
        XCTAssertNil(R.rankingEmpty(result([c("a", rating: 8)], [row("a", 8, 3, 2)])))
    }
}
