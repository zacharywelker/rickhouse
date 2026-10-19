import XCTest
@testable import Rickhouse

// Mirrors src/lib/tournaments/__tests__/bracket-actions.test.ts.
final class TournamentFlightActionsTests: XCTestCase {
    private typealias A = FlightActions

    private func heat(_ id: Int, _ round: Int, _ status: HeatStatus, hidden: Bool = false, entries: [HeatEntry] = []) -> TournamentHeat {
        Fx.heat(id, round, id, entries, status: status, hidden: hidden, count: 2)
    }

    func testCanPlayOnlyAPendingFlightOfTheCurrentRoundOfARunningTournament() {
        let v = Fx.view(.active, [[heat(1, 1, .decided)], [heat(2, 2, .pending)]])
        XCTAssertTrue(A.canPlay(v, v.rounds[1].heats[0]))
        XCTAssertFalse(A.canPlay(v, v.rounds[0].heats[0]))
        XCTAssertFalse(A.canPlay(Fx.view(.draft, [[heat(1, 1, .pending)]]), heat(1, 1, .pending)))
        XCTAssertFalse(A.canPlay(Fx.view(.complete, [[heat(1, 1, .pending)]]), heat(1, 1, .pending)))
    }

    func testCanUndoADecidedFlightWithNoResultAfterIt() {
        let v = Fx.view(.active, [[heat(1, 1, .decided)], [heat(2, 2, .pending)]])
        XCTAssertTrue(A.canUndo(v, v.rounds[0].heats[0]))
        XCTAssertFalse(A.canUndo(v, v.rounds[1].heats[0]))
    }

    func testCannotUndoWhenALaterRoundHasAResultNorForAByeOrADraft() {
        let v = Fx.view(.active, [[heat(1, 1, .decided), heat(3, 1, .bye)], [heat(2, 2, .decided), heat(4, 2, .pending)]])
        XCTAssertFalse(A.canUndo(v, v.rounds[0].heats[0]))
        XCTAssertTrue(A.canUndo(v, v.rounds[1].heats[0]))
        XCTAssertFalse(A.canUndo(v, v.rounds[0].heats[1]))
        XCTAssertFalse(A.canUndo(Fx.view(.draft, [[heat(1, 1, .decided)]]), heat(1, 1, .decided)))
    }

    func testAFinishedTournamentsFinalCanBeTakenBack() {
        let v = Fx.view(.complete, [[heat(1, 1, .decided)]])
        XCTAssertTrue(A.canUndo(v, v.rounds[0].heats[0]))
    }

    func testCanWithdrawAnActiveEntryInAnUndecidedFlightOfTheCurrentRound() {
        let v = Fx.view(.active, [[heat(1, 1, .pending), heat(2, 1, .decided)]])
        XCTAssertTrue(A.canWithdraw(v, v.rounds[0].heats[0], entryId: 1))
        XCTAssertFalse(A.canWithdraw(v, v.rounds[0].heats[0], entryId: 2), "already withdrawn")
        XCTAssertFalse(A.canWithdraw(v, v.rounds[0].heats[1], entryId: 1), "decided flight")
    }

    func testCannotWithdrawFromAHiddenFlightADraftOrAFinishedTournament() {
        let hidden = heat(1, 1, .pending, hidden: true)
        XCTAssertFalse(A.canWithdraw(Fx.view(.active, [[hidden]]), hidden, entryId: 1))
        XCTAssertFalse(A.canWithdraw(Fx.view(.draft, [[heat(1, 1, .pending)]]), heat(1, 1, .pending), entryId: 1))
        XCTAssertFalse(A.canWithdraw(Fx.view(.complete, [[heat(1, 1, .pending)]]), heat(1, 1, .pending), entryId: 1))
    }

    func testCanMoveADraftsPendingFlights() {
        XCTAssertTrue(A.canMove(Fx.view(.draft, [[heat(1, 1, .pending)]]), heat(1, 1, .pending)))
    }

    func testCanMoveARunningOpenTournamentsPendingFlightsOfTheCurrentRoundOnly() {
        let v = Fx.view(.active, [[heat(1, 1, .bye)], [heat(2, 2, .pending)]])
        XCTAssertTrue(A.canMove(v, v.rounds[1].heats[0]))
        XCTAssertFalse(A.canMove(v, v.rounds[0].heats[0]))
    }

    func testAByesLoneBottleCanMoveInADraftOrTheCurrentRound() {
        XCTAssertTrue(A.canMove(Fx.view(.draft, [[heat(1, 1, .bye)]]), heat(1, 1, .bye)))
        XCTAssertTrue(A.canMove(Fx.view(.active, [[heat(1, 1, .bye), heat(2, 1, .pending)]]), heat(1, 1, .bye)))
        XCTAssertFalse(A.isOpen(heat(1, 1, .decided)))
    }

    func testCannotMoveARunningBlindOneAHiddenFlightOrInAFinishedTournament() {
        XCTAssertFalse(A.canMove(Fx.view(.active, [[heat(1, 1, .pending)]], blind: true), heat(1, 1, .pending)))
        let hidden = heat(1, 1, .pending, hidden: true)
        XCTAssertFalse(A.canMove(Fx.view(.active, [[hidden]]), hidden))
        XCTAssertFalse(A.canMove(Fx.view(.complete, [[heat(1, 1, .pending)]]), heat(1, 1, .pending)))
    }

    func testAnyFlightCanBeRenamedInAnyStateButAHiddenOne() {
        for status in [HeatStatus.decided, .pending, .bye] { XCTAssertTrue(A.canRename(hidden: heat(1, 1, status).hidden)) }
        XCTAssertFalse(A.canRename(hidden: heat(1, 1, .pending, hidden: true).hidden))
    }

    func testCanResetADraftWithTwoActiveEntriesARunningOneWithSomethingUndecidedNeverFinished() {
        XCTAssertFalse(A.canReset(Fx.view(.draft, [[heat(1, 1, .pending)]])), "one active entry")
        let two = Fx.view(.draft, rounds: [], entries: [Fx.people[0], TournamentEntry(id: 3, name: "C", status: .active, kind: .bottle, bottleId: 3, expressionId: 3)])
        XCTAssertTrue(A.canReset(two))
        XCTAssertTrue(A.canReset(Fx.view(.active, [[heat(1, 1, .decided), heat(2, 1, .pending)]])))
        XCTAssertFalse(A.canReset(Fx.view(.active, [[heat(1, 1, .decided)]])))
        XCTAssertFalse(A.canReset(Fx.view(.complete, [[heat(1, 1, .decided)]])))
    }

    func testFlightControlsListWhatAPendingFlightOfARunningOpenTournamentOffers() {
        let h = heat(1, 1, .pending, entries: [Fx.entry(1, "x", nil), Fx.entry(2, "x", nil)])
        XCTAssertEqual(A.flightControls(Fx.view(.active, [[h]]), h), FlightControls(play: true, undo: false, move: true, withdraw: [1]))
    }

    func testFlightControlsOfferAHiddenFlightPlayAndNothingThatNamesAnEntry() {
        let h = heat(1, 1, .pending, hidden: true)
        XCTAssertEqual(A.flightControls(Fx.view(.active, [[h]], blind: true), h), FlightControls(play: true, undo: false, move: false, withdraw: []))
    }

    func testFlightControlsOfferADecidedFlightUndoOnly() {
        let h = heat(1, 1, .decided, entries: [Fx.entry(1, "x", nil)])
        XCTAssertEqual(A.flightControls(Fx.view(.active, [[h]]), h), FlightControls(play: false, undo: true, move: false, withdraw: []))
    }

    func testCanDrawARunningBlindTournamentWithAPendingFlightInTheCurrentRound() {
        XCTAssertTrue(A.canDraw(Fx.view(.active, [[heat(1, 1, .decided), heat(2, 1, .pending)]], blind: true)))
        XCTAssertFalse(A.canDraw(Fx.view(.active, [[heat(1, 1, .pending)]], blind: false)))
        XCTAssertFalse(A.canDraw(Fx.view(.active, [[heat(1, 1, .decided)]], blind: true)))
        XCTAssertFalse(A.canDraw(Fx.view(.draft, [[heat(1, 1, .pending)]], blind: true)))
        XCTAssertFalse(A.canDraw(Fx.view(.complete, [[heat(1, 1, .decided)]], blind: true)))
    }

    func testNextPendingIdIsTheNextAfterThisSlotWrappingElseNil() {
        let v = Fx.view(.active, [[heat(1, 1, .decided)], [heat(2, 2, .pending), heat(3, 2, .decided), heat(4, 2, .pending), heat(5, 2, .pending)]])
        XCTAssertEqual(A.nextPendingId(v, heatId: 2), 4)
        XCTAssertEqual(A.nextPendingId(v, heatId: 4), 5)
        XCTAssertEqual(A.nextPendingId(v, heatId: 5), 2)
        XCTAssertEqual(A.nextPendingId(v, heatId: 3), 4)
        XCTAssertNil(A.nextPendingId(Fx.view(.active, [[heat(1, 1, .decided), heat(2, 1, .pending)]]), heatId: 2))
    }
}
