import XCTest
@testable import Rickhouse

/// What a running or finished tournament's screen offers: the bar, the header lines, the withdraw question, and Find a bottle.
final class TournamentRunLogicTests: XCTestCase {
    private typealias R = TournamentRunLogic

    private func e(_ id: Int, _ name: String) -> HeatEntry { Fx.entry(id, name, 90) }
    private func heat(_ id: Int, _ round: Int, _ status: HeatStatus, _ entries: [HeatEntry] = [], hidden: Bool = false) -> TournamentHeat {
        Fx.heat(id, round, id, entries, status: status, hidden: hidden, count: max(entries.count, 2))
    }

    // MARK: the bar

    func testARunningOpenTournamentOffersOnlyReset() {
        let v = Fx.view(.active, [[heat(1, 1, .pending, [e(1, "A"), e(2, "B")])]])
        XCTAssertEqual(R.bar(v), RunBarOffer(draw: false, reset: true))
    }

    func testARunningBlindTournamentWithAFlightToTasteOffersDrawAndReset() {
        let v = Fx.view(.active, [[heat(1, 1, .pending, hidden: true)]], blind: true)
        XCTAssertEqual(R.bar(v), RunBarOffer(draw: true, reset: true))
    }

    func testNothingLeftToTasteOffersNoBar() {
        let v = Fx.view(.active, [[heat(1, 1, .decided, [e(1, "A"), e(2, "B")])]], blind: true)
        XCTAssertNil(R.bar(v))
    }

    func testDraftsAndFinishedTournamentsHaveNoRunBar() {
        XCTAssertNil(R.bar(Fx.view(.draft, [[heat(1, 1, .pending)]])))
        XCTAssertNil(R.bar(Fx.view(.complete, [[heat(1, 1, .decided)]])))
    }

    func testTheResetNoteSaysDecidedFlightsStay() {
        XCTAssertTrue(R.resetNote.contains("Decided flights stay"))
    }

    // MARK: header lines

    func testBlindLineOnlyWhileARunningBlindTournamentRuns() {
        XCTAssertEqual(R.blindLine(Fx.view(.active, [[heat(1, 1, .pending)]], blind: true)), "Blind: names stay hidden until a flight is decided.")
        XCTAssertNil(R.blindLine(Fx.view(.active, [[heat(1, 1, .pending)]])))
        XCTAssertNil(R.blindLine(Fx.view(.complete, [[heat(1, 1, .decided)]], blind: true)))
        XCTAssertNil(R.blindLine(Fx.view(.draft, [[heat(1, 1, .pending)]], blind: true)))
    }

    func testStandingsTitleSaysFinalOnceFinished() {
        XCTAssertEqual(R.standingsTitle(Fx.view(.active, [[heat(1, 1, .pending)]])), "Standings so far")
        XCTAssertEqual(R.standingsTitle(Fx.view(.complete, [[heat(1, 1, .decided)]])), "Final standings")
    }

    // MARK: asking

    func testTheWithdrawQuestionNamesTheBottleAndSaysResultsStay() {
        XCTAssertEqual(R.withdrawTitle("Pappy 15"), "Withdraw Pappy 15?")
        XCTAssertEqual(R.withdrawMessage, "It leaves its flight; results already recorded stay.")
    }

    // MARK: find a bottle

    private func field() -> TournamentView {
        Fx.view(.active, [
            [heat(1, 1, .decided, [e(1, "Buffalo Trace"), e(2, "Eagle Rare")]), heat(2, 1, .decided, [e(3, "Buffalo Trace Kosher"), e(4, "Weller")])],
            [heat(3, 2, .pending, [e(1, "Buffalo Trace"), e(4, "Weller")]), heat(4, 2, .pending, hidden: true)],
        ])
    }

    func testStepWalksTheMatchesAndWrapsRound() {
        var f = FindState()
        f.setQuery("buffalo")
        let m = f.matches(field())
        XCTAssertEqual(m.map(\.heatId), [1, 2, 3])
        XCTAssertNil(f.index)
        XCTAssertEqual(f.step(1, count: m.count), 0)
        XCTAssertEqual(f.step(1, count: m.count), 1)
        XCTAssertEqual(f.step(1, count: m.count), 2)
        XCTAssertEqual(f.step(1, count: m.count), 0)
        XCTAssertEqual(f.step(-1, count: m.count), 2)
    }

    func testPreviousFromNowhereGoesToTheLastMatch() {
        var f = FindState()
        f.setQuery("weller")
        XCTAssertEqual(f.step(-1, count: f.matches(field()).count), 1)
    }

    func testTypingAgainForgetsTheCurrentMatch() {
        var f = FindState()
        f.setQuery("weller")
        _ = f.step(1, count: 2)
        f.setQuery("weller x")
        XCTAssertNil(f.index)
    }

    func testStatusTextMirrorsTheWeb() {
        var f = FindState()
        XCTAssertEqual(f.status(count: 0), "")
        f.setQuery("zzz")
        XCTAssertEqual(f.status(count: 0), "No bottle matches.")
        f.setQuery("buffalo")
        XCTAssertEqual(f.status(count: 1), "1 match")
        XCTAssertEqual(f.status(count: 3), "3 matches")
        _ = f.step(1, count: 3)
        XCTAssertEqual(f.status(count: 3), "Match 1 of 3")
    }

    func testAMatchThatVanishedAfterAReloadIsNotCurrent() {
        var f = FindState()
        f.setQuery("buffalo")
        _ = f.step(-1, count: 3)
        XCTAssertNil(f.current(in: Array(f.matches(field()).prefix(1))))
        XCTAssertEqual(f.status(count: 1), "1 match")
    }

    func testHighlightIsPerRoundAndKeepsTheCurrentOne() {
        var f = FindState()
        f.setQuery("buffalo")
        let m = f.matches(field())
        _ = f.step(1, count: m.count)
        _ = f.step(1, count: m.count)
        let round1 = f.highlight(m, round: 1)
        XCTAssertEqual(round1.entryIds, [1, 3])
        XCTAssertEqual(round1.currentEntryId, 3)
        let round2 = f.highlight(m, round: 2)
        XCTAssertEqual(round2.entryIds, [1])
        XCTAssertNil(round2.currentEntryId)
    }

    func testNothingIsHighlightedWithoutAQuery() {
        let f = FindState()
        XCTAssertEqual(f.highlight(f.matches(field()), round: 1), FindHighlight())
    }

    func testTheRoundToShowIsTheCurrentMatchsRound() {
        var f = FindState()
        f.setQuery("buffalo")
        let m = f.matches(field())
        XCTAssertNil(f.currentRound(in: m))
        _ = f.step(-1, count: m.count)
        XCTAssertEqual(f.currentRound(in: m), 2)
    }
}
