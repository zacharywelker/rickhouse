import XCTest
@testable import Rickhouse

// Mirrors src/lib/tournaments/__tests__/drag-model.test.ts.
final class TournamentDragModelTests: XCTestCase {
    private typealias D = DragModel

    private func ent(_ id: Int) -> HeatEntry { Fx.entry(id, "B\(id)", 100) }
    private func heat(_ id: Int, _ round: Int, _ slot: Int, _ status: HeatStatus, _ ids: [Int], hidden: Bool = false, count: Int? = nil) -> TournamentHeat {
        Fx.heat(id, round, slot, hidden ? [] : ids.map(ent), status: status, hidden: hidden, count: count ?? ids.count)
    }
    private func mk(_ status: TournamentStatus, _ heats: [TournamentHeat], blind: Bool = false, current: Int? = 1, rounds: [TournamentRound]? = nil) -> TournamentView {
        Fx.view(status, rounds: rounds ?? [TournamentRound(round: 1, heats: heats)], current: .some(current), blind: blind, heatSize: 3)
    }
    // flight 1: 1,2,3 (full); flight 2: 4,5; flight 3: 6 (bye)
    private func draft() -> TournamentView {
        mk(.draft, [heat(1, 1, 1, .pending, [1, 2, 3]), heat(2, 1, 2, .pending, [4, 5]), heat(3, 1, 3, .bye, [6])])
    }
    private func b(_ e: Int, _ h: Int) -> Drag { .bottle(entryId: e, fromHeatId: h) }
    private func none(_ r: DropReason) -> DropOutcome { .none(r) }
    private func drop(_ v: TournamentView, _ d: Drag, _ t: DropTarget) -> DropOutcome { D.dropOutcome(v, d, t) }

    // a bottle dropped on a flight
    func testBottleMovesIntoAFlightWithRoomIncludingALoneBottleFlight() {
        XCTAssertEqual(drop(draft(), b(1, 1), .flight(heatId: 2)), .move(entryId: 1, toHeatId: 2))
        XCTAssertEqual(drop(draft(), b(1, 1), .flight(heatId: 3)), .move(entryId: 1, toHeatId: 3))
    }
    func testBottleOnAFullOwnOrMissingFlightIsRefused() {
        XCTAssertEqual(drop(draft(), b(4, 2), .flight(heatId: 1)), none(.full))
        XCTAssertEqual(drop(draft(), b(4, 2), .flight(heatId: 2)), none(.same))
        XCTAssertEqual(drop(draft(), b(4, 2), .flight(heatId: 99)), none(.gone))
    }
    func testBottleNotInTheFlightItClaimsIsRefused() {
        XCTAssertEqual(drop(draft(), b(9, 2), .flight(heatId: 3)), none(.gone))
        XCTAssertEqual(drop(draft(), b(4, 99), .flight(heatId: 3)), none(.gone))
    }
    func testBottleNeverOntoAGap() {
        XCTAssertEqual(drop(draft(), b(4, 2), .slot(index: 0)), none(.unsupported))
    }

    // a bottle dropped on a bottle
    func testSwapWithABottleOfAnotherOpenFlightEvenWhenFull() {
        XCTAssertEqual(drop(draft(), b(4, 2), .bottle(entryId: 1, heatId: 1)), .swap(entryId: 4, withEntryId: 1))
        XCTAssertEqual(drop(draft(), b(6, 3), .bottle(entryId: 1, heatId: 1)), .swap(entryId: 6, withEntryId: 1))
    }
    func testNotWithItselfOrABottleOfItsOwnFlight() {
        XCTAssertEqual(drop(draft(), b(4, 2), .bottle(entryId: 4, heatId: 2)), none(.same))
        XCTAssertEqual(drop(draft(), b(4, 2), .bottle(entryId: 5, heatId: 2)), none(.same))
    }
    func testNotWithABottleThatIsNotWhereTheTargetSays() {
        XCTAssertEqual(drop(draft(), b(4, 2), .bottle(entryId: 6, heatId: 1)), none(.gone))
    }

    // closed flights
    private func running() -> TournamentView {
        mk(.active, [heat(1, 1, 1, .decided, [1, 2]), heat(2, 1, 2, .pending, [3, 4]), heat(3, 1, 3, .pending, [5])])
    }
    func testADecidedFlightNeitherGivesNorTakesABottle() {
        XCTAssertEqual(drop(running(), b(1, 1), .flight(heatId: 2)), none(.closed))
        XCTAssertEqual(drop(running(), b(3, 2), .flight(heatId: 1)), none(.closed))
        XCTAssertEqual(drop(running(), b(3, 2), .bottle(entryId: 1, heatId: 1)), none(.closed))
    }
    func testRunningNonBlindCurrentRoundMovesAndSwapsWork() {
        XCTAssertEqual(drop(running(), b(3, 2), .flight(heatId: 3)), .move(entryId: 3, toHeatId: 3))
        XCTAssertEqual(drop(running(), b(3, 2), .bottle(entryId: 5, heatId: 3)), .swap(entryId: 3, withEntryId: 5))
    }
    func testAFinishedTournamentOffersNothing() {
        let done = mk(.complete, [heat(1, 1, 1, .pending, [1, 2]), heat(2, 1, 2, .pending, [3])])
        XCTAssertEqual(drop(done, b(1, 1), .flight(heatId: 2)), none(.closed))
        XCTAssertEqual(drop(done, .flight(heatId: 1), .slot(index: 2)), none(.closed))
    }
    func testAnEarlierRoundIsClosed() {
        let r1 = [heat(1, 1, 1, .pending, [1, 2]), heat(2, 1, 2, .pending, [3])]
        let two = mk(.active, [], current: 2, rounds: [TournamentRound(round: 1, heats: r1), TournamentRound(round: 2, heats: [heat(4, 2, 1, .pending, [1, 3])])])
        XCTAssertEqual(drop(two, b(1, 1), .flight(heatId: 2)), none(.closed))
    }
    func testABlindRunningTournamentMovesNothingAndAHiddenFlightIsNeverATargetOrSource() {
        let blind = mk(.active, [heat(1, 1, 1, .pending, [], hidden: true, count: 2), heat(2, 1, 2, .pending, [3])], blind: true)
        XCTAssertEqual(drop(blind, b(3, 2), .flight(heatId: 1)), none(.closed))
        XCTAssertEqual(drop(blind, b(3, 2), .bottle(entryId: 5, heatId: 1)), none(.closed))
        XCTAssertEqual(drop(blind, .flight(heatId: 1), .slot(index: 2)), none(.hidden))
    }
    func testAHiddenFlightAsTargetOfAnOtherwiseMovableBottle() {
        let v = mk(.draft, [heat(1, 1, 1, .pending, [], hidden: true, count: 2), heat(2, 1, 2, .pending, [3])])
        XCTAssertEqual(drop(v, b(3, 2), .flight(heatId: 1)), none(.hidden))
        XCTAssertEqual(drop(v, b(3, 2), .bottle(entryId: 5, heatId: 1)), none(.hidden))
    }
    func testABlindDraftIsOpen() {
        let d = mk(.draft, [heat(1, 1, 1, .pending, [1, 2]), heat(2, 1, 2, .pending, [3])], blind: true)
        XCTAssertEqual(drop(d, b(3, 2), .flight(heatId: 1)), .move(entryId: 3, toHeatId: 1))
    }

    // a flight dragged
    private func f(_ id: Int) -> Drag { .flight(heatId: id) }
    func testFlightOntoAGapTakesThePlaceItWillHaveAfterwards() {
        XCTAssertEqual(drop(draft(), f(3), .slot(index: 0)), .reorder(heatId: 3, toSlot: 1))
        XCTAssertEqual(drop(draft(), f(1), .slot(index: 3)), .reorder(heatId: 1, toSlot: 3))
        XCTAssertEqual(drop(draft(), f(1), .slot(index: 2)), .reorder(heatId: 1, toSlot: 2))
        XCTAssertEqual(drop(draft(), f(3), .slot(index: 1)), .reorder(heatId: 3, toSlot: 2))
    }
    func testFlightOntoTheGapsBesideItselfIsNothing() {
        XCTAssertEqual(drop(draft(), f(2), .slot(index: 1)), none(.same))
        XCTAssertEqual(drop(draft(), f(2), .slot(index: 2)), none(.same))
    }
    func testFlightOntoAnotherFlightTakesItsPlace() {
        XCTAssertEqual(drop(draft(), f(1), .flight(heatId: 3)), .reorder(heatId: 1, toSlot: 3))
        XCTAssertEqual(drop(draft(), f(3), .flight(heatId: 1)), .reorder(heatId: 3, toSlot: 1))
        XCTAssertEqual(drop(draft(), f(2), .flight(heatId: 2)), none(.same))
    }
    func testFlightGapsOutOfRangeOrMissingFlightIsNothing() {
        XCTAssertEqual(drop(draft(), f(1), .slot(index: -1)), none(.gone))
        XCTAssertEqual(drop(draft(), f(1), .slot(index: 4)), none(.gone))
        XCTAssertEqual(drop(draft(), f(99), .slot(index: 1)), none(.gone))
        XCTAssertEqual(drop(draft(), f(1), .flight(heatId: 99)), none(.gone))
    }
    func testFlightNeverOntoABottle() {
        XCTAssertEqual(drop(draft(), f(1), .bottle(entryId: 4, heatId: 2)), none(.unsupported))
    }
    func testSlotsAreReadInSlotOrderGapsInNumberingIncluded() {
        let v = mk(.draft, [heat(1, 1, 7, .pending, [1, 2]), heat(2, 1, 3, .pending, [3, 4]), heat(3, 1, 9, .pending, [5, 6])])
        XCTAssertEqual(drop(v, f(3), .slot(index: 0)), .reorder(heatId: 3, toSlot: 1))
    }
    func testRunningCurrentRoundYesDecidedAndEarlierRoundsNo() {
        let v = mk(.active, [heat(1, 1, 1, .decided, [1, 2]), heat(2, 1, 2, .pending, [3, 4]), heat(3, 1, 3, .pending, [5, 6])])
        XCTAssertEqual(drop(v, f(3), .slot(index: 0)), .reorder(heatId: 3, toSlot: 1))
        XCTAssertEqual(drop(v, f(1), .slot(index: 2)), none(.closed))
        XCTAssertFalse(D.canDragFlight(v, v.rounds[0].heats[0]))
        XCTAssertTrue(D.canDragFlight(v, v.rounds[0].heats[1]))
    }
    func testCanDragABottleOnlyWhereTheMenuOffersMove() {
        let v = running()
        XCTAssertEqual(v.rounds[0].heats.map { D.canDragBottle(v, $0) }, [false, true, true])
    }

    func testRefusalTextHasWordsForEveryReason() {
        XCTAssertEqual(D.refusalText(.full), "Full")
        XCTAssertEqual(D.refusalText(.same), "Already here")
        XCTAssertEqual(D.refusalText(.hidden), "Hidden")
        XCTAssertEqual(D.refusalText(.closed), "Can't change")
        XCTAssertEqual(D.refusalText(.unsupported), "Can't drop here")
    }

    func testDescribeOutcomeNamesWhatHappened() {
        let v = draft()
        XCTAssertEqual(D.describeOutcome(v, .move(entryId: 1, toHeatId: 2)), "Moved B1 to Flight 2")
        XCTAssertEqual(D.describeOutcome(v, .swap(entryId: 4, withEntryId: 1)), "Swapped B4 with B1")
        XCTAssertEqual(D.describeOutcome(v, .reorder(heatId: 3, toSlot: 1)), "Moved flight 3 to position 1")
        XCTAssertNil(D.describeOutcome(v, .none(.full)))
    }

    // the payload that leaves the app when a drop lands elsewhere
    func testThePayloadCarriesIdsAndNeverAName() throws {
        for drag in [Drag.bottle(entryId: 7, fromHeatId: 3), .flight(heatId: 3)] {
            let data = try JSONEncoder().encode(drag)
            let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
            func leaves(_ any: Any) -> [Any] {
                if let d = any as? [String: Any] { return d.values.flatMap(leaves) }
                return [any]
            }
            XCTAssertTrue(leaves(json).allSatisfy { $0 is NSNumber }, "only numbers: \(json)")
            XCTAssertEqual(try JSONDecoder().decode(Drag.self, from: data), drag)
        }
    }
}
