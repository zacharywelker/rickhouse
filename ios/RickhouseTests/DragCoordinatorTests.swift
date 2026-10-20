import XCTest
@testable import Rickhouse

/// The coordinator that carries a drag to a drop zone (TournamentDragViews.swift); the rules themselves are DragModel's.
@MainActor
final class DragCoordinatorTests: XCTestCase {
    private func ent(_ id: Int) -> HeatEntry { Fx.entry(id, "B\(id)", 100) }
    private func heat(_ id: Int, _ slot: Int, _ ids: [Int]) -> TournamentHeat { Fx.heat(id, 1, slot, ids.map(ent)) }
    // flight 1: 1,2,3 (full at size 3); flight 2: 4,5; flight 3: 6
    private func draft() -> TournamentView {
        Fx.view(.draft, rounds: [TournamentRound(round: 1, heats: [heat(1, 1, [1, 2, 3]), heat(2, 2, [4, 5]), heat(3, 3, [6])])], current: .some(1), heatSize: 3)
    }

    private final class Log { var performed: [DropOutcome] = []; var said: [String?] = []; var notices: [String] = [] }

    private func make(busy: Bool = false) -> (DragCoordinator, Log) {
        let c = DragCoordinator(), log = Log()
        c.view = { self.draft() }
        c.busy = { busy }
        c.perform = { outcome, said in log.performed.append(outcome); log.said.append(said) }
        c.notice = { log.notices.append($0) }
        return (c, log)
    }

    private let lift4 = Drag.bottle(entryId: 4, fromHeatId: 2)

    func testCueFollowsTheOutcomeOfTheTargetUnderTheFinger() {
        let (c, _) = make()
        c.begin(lift4)
        c.hover = .flight(heatId: 3)
        XCTAssertEqual(c.cue(for: .flight(heatId: 3)), "Move here")
        c.hover = .flight(heatId: 1)
        XCTAssertEqual(c.cue(for: .flight(heatId: 1)), "Full")
        XCTAssertNil(c.cue(for: .flight(heatId: 3)), "only the hovered target speaks")
        c.hover = .bottle(entryId: 1, heatId: 1)
        XCTAssertEqual(c.cue(for: .bottle(entryId: 1, heatId: 1)), "Swap")
        c.begin(.flight(heatId: 1))
        c.hover = .slot(index: 3)
        XCTAssertEqual(c.cue(for: .slot(index: 3)), "Place here")
    }

    func testOwnFlightGivesNoCueAndIsNotAccepted() {
        let (c, _) = make()
        c.begin(lift4)
        c.hover = .flight(heatId: 2)
        XCTAssertNil(c.cue(for: .flight(heatId: 2)))
        XCTAssertFalse(c.accepts(.flight(heatId: 2)))
        XCTAssertTrue(c.accepts(.flight(heatId: 3)))
        XCTAssertFalse(c.accepts(.flight(heatId: 1)), "full")
    }

    func testDropPerformsTheOutcomeAndClearsTheDrag() {
        let (c, log) = make()
        c.begin(lift4)
        c.hover = .flight(heatId: 3)
        XCTAssertTrue(c.drop(.flight(heatId: 3), payload: lift4))
        XCTAssertEqual(log.performed, [.move(entryId: 4, toHeatId: 3)])
        XCTAssertEqual(log.said, ["Moved B4 to Flight 3"])
        XCTAssertNil(c.current)
        XCTAssertNil(c.hover)
    }

    func testARefusedDropDoesNotPerformButStillClears() {
        let (c, log) = make()
        c.begin(lift4)
        XCTAssertFalse(c.drop(.flight(heatId: 1), payload: lift4))
        XCTAssertTrue(log.performed.isEmpty)
        XCTAssertNil(c.current)
    }

    func testDropWhileSavingIsRefusedWithANotice() {
        let (c, log) = make(busy: true)
        c.begin(lift4)
        XCTAssertFalse(c.drop(.flight(heatId: 3), payload: lift4))
        XCTAssertTrue(log.performed.isEmpty)
        XCTAssertEqual(log.notices, ["One moment"])
        XCTAssertNil(c.current)
    }

    func testAnotherPayloadThanTheLiftedOneIsIgnored() {
        let (c, log) = make()
        c.begin(lift4)
        // a JSON item from Files or another app, or an older drag: nothing runs
        XCTAssertFalse(c.drop(.flight(heatId: 3), payload: nil))
        XCTAssertTrue(log.performed.isEmpty)
        c.begin(lift4)
        XCTAssertFalse(c.drop(.flight(heatId: 3), payload: .bottle(entryId: 5, fromHeatId: 2)))
        XCTAssertTrue(log.performed.isEmpty)
        XCTAssertNil(c.current, "a stale drag does not outlive the drop")
    }

    func testAbandonedDragIsForgottenOnReset() {
        let (c, log) = make()
        c.begin(lift4)
        c.hover = .flight(heatId: 3)
        c.reset()
        XCTAssertNil(c.current)
        XCTAssertNil(c.hover)
        XCTAssertFalse(c.drop(.flight(heatId: 3), payload: lift4))
        XCTAssertTrue(log.performed.isEmpty)
    }
}
