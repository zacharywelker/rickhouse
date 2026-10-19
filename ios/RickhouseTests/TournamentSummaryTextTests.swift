import XCTest
@testable import Rickhouse

final class TournamentSummaryTextTests: XCTestCase {
    private func summary(_ status: TournamentStatus, round: Int? = nil, of total: Int = 0, done: Int = 0, flights: Int = 0,
                         blind: Bool = false, entries: Int = 12, size: Int = 4) -> TournamentSummary {
        TournamentSummary(id: 1, name: "Bourbon, spring", status: status, heatSize: size, blind: blind, entryCount: entries,
                          currentRound: round, totalRounds: total, progress: .init(done: done, total: flights), createdAt: "", completedAt: nil)
    }

    // The web summary-text.test.ts cases.
    func testDraft() { XCTAssertEqual(TournamentSummaryText.statusLine(summary(.draft)), "Draft") }

    func testRunningSaysRoundAndDecided() {
        XCTAssertEqual(TournamentSummaryText.statusLine(summary(.active, round: 2, of: 4, done: 3, flights: 6)), "Round 2 of 4 · 3 of 6 flights decided")
    }

    func testSingularFlight() {
        XCTAssertEqual(TournamentSummaryText.statusLine(summary(.active, round: 3, of: 3, done: 0, flights: 1)), "Round 3 of 3 · 0 of 1 flight decided")
    }

    func testWithdrawalsShrinkThePlan() {
        XCTAssertEqual(TournamentSummaryText.statusLine(summary(.active, round: 3, of: 2, done: 1, flights: 2)), "Round 3 · 1 of 2 flights decided")
        XCTAssertEqual(TournamentSummaryText.statusLine(summary(.active, round: 1, of: 0, done: 0, flights: 1)), "Round 1 · 0 of 1 flight decided")
    }

    func testRunningWithoutARound() { XCTAssertEqual(TournamentSummaryText.statusLine(summary(.active)), "Running") }

    func testComplete() { XCTAssertEqual(TournamentSummaryText.statusLine(summary(.complete, round: 3, of: 3, done: 1, flights: 1)), "Complete") }

    func testLabels() {
        XCTAssertEqual(TournamentSummaryText.entriesLabel(1), "1 entry")
        XCTAssertEqual(TournamentSummaryText.entriesLabel(0), "0 entries")
        XCTAssertEqual(TournamentSummaryText.entriesLabel(12), "12 entries")
        XCTAssertEqual(TournamentSummaryText.heatSizeLabel(3), "flights of 3")
    }

    // The phone's row texts.
    func testMetaLine() {
        XCTAssertEqual(TournamentSummaryText.metaLine(summary(.draft)), "Draft · 12 entries · flights of 4")
        XCTAssertEqual(TournamentSummaryText.metaLine(summary(.active, round: 2, of: 3, done: 0, flights: 2, blind: true)), "Round 2 of 3 · Blind · 12 entries · flights of 4")
        XCTAssertEqual(TournamentSummaryText.metaLine(summary(.complete, round: 2, of: 2, entries: 1, size: 2)), "Complete · 1 entry · flights of 2")
    }

    func testAccessibilityLabel() {
        XCTAssertEqual(TournamentSummaryText.accessibilityLabel(summary(.active, round: 2, of: 3, done: 0, flights: 2, blind: true)),
                       "Bourbon, spring. Round 2 of 3, blind, 12 entries, flights of 4, 0 of 2 flights decided")
        XCTAssertEqual(TournamentSummaryText.accessibilityLabel(summary(.draft)), "Bourbon, spring. Draft, 12 entries, flights of 4")
    }

    func testProgressAndDelete() {
        XCTAssertTrue(TournamentSummaryText.showsProgress(summary(.active, round: 1, of: 2, flights: 3)))
        XCTAssertFalse(TournamentSummaryText.showsProgress(summary(.active, round: 1, of: 2, flights: 0)))
        XCTAssertFalse(TournamentSummaryText.showsProgress(summary(.complete, round: 2, of: 2, done: 1, flights: 1)))
        XCTAssertTrue(TournamentSummaryText.canDelete(summary(.draft)))
        XCTAssertTrue(TournamentSummaryText.canDelete(summary(.complete)))
        XCTAssertFalse(TournamentSummaryText.canDelete(summary(.active, round: 1, of: 2, flights: 1)))
    }
}
