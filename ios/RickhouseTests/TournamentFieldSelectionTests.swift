import XCTest
@testable import Rickhouse

// Mirrors src/lib/tournaments/__tests__/field-selection.test.ts.
final class TournamentFieldSelectionTests: XCTestCase {
    private typealias F = TournamentFieldSelection
    private func bottle(_ n: Int) -> PickedBottle { PickedBottle(bottleId: n, expressionId: 100 + n, name: "Bottle \(n)") }
    private func run(_ state: FieldState, _ actions: FieldAction...) -> FieldState { actions.reduce(state) { F.reduce($0, $1) } }
    private func bottleIds(_ s: FieldState) -> [Int] { s.entries.compactMap { if case .bottle(let b) = $0 { b.bottleId } else { nil } } }

    func testTogglesABottleOnAndOff() {
        let on = run(.empty, .toggleBottle(bottle(1)))
        XCTAssertEqual(on.entries, [.bottle(bottle(1))])
        XCTAssertEqual(run(on, .toggleBottle(bottle(1))).entries, [])
    }

    func testSelectsEveryShownBottleOnceKeepingTheOrderPicked() {
        let state = run(.empty, .toggleBottle(bottle(2)), .selectAll([bottle(1), bottle(2), bottle(3)]))
        XCTAssertEqual(bottleIds(state), [2, 1, 3])
    }

    func testClearsEverythingAndRemovesOneEntryByKey() {
        let state = run(.empty, .selectAll([bottle(1), bottle(2)]))
        XCTAssertEqual(run(state, .remove(key: PickedEntry.bottle(bottle(1)).key)).entries, [.bottle(bottle(2))])
        XCTAssertEqual(run(state, .clear).entries, [])
    }

    func testAddsALabelOnceAndStillAllowsALabelWhoseBottleIsAlreadyPicked() {
        let state = run(.empty, .toggleBottle(bottle(5)), .addLabel(expressionId: 105, name: "Bottle 5's label"))
        XCTAssertEqual(state.entries.count, 2)
        let again = run(state, .addLabel(expressionId: 105, name: "Bottle 5's label"))
        XCTAssertEqual(again.entries.count, 2)
        XCTAssertEqual(again.notice, "That label is already in the field.")
    }

    func testAddsAnOutsideEntryTrimmedIgnoresBlanksAndDuplicatesAndCapsTheLength() {
        var state = run(.empty, .addAdhoc("  Grandpa's rye  "))
        XCTAssertEqual(state.entries, [.adhoc(PickedAdhoc(key: "grandpa's rye", name: "Grandpa's rye"))])
        state = run(state, .addAdhoc("GRANDPA'S   RYE"))
        XCTAssertEqual(state.entries.count, 1)
        XCTAssertTrue(state.notice?.lowercased().contains("already") ?? false)
        state = run(state, .addAdhoc("   "))
        XCTAssertEqual(state.entries.count, 1)
        state = run(state, .addAdhoc(String(repeating: "x", count: 121)))
        XCTAssertEqual(state.entries.count, 1)
        XCTAssertTrue(state.notice?.contains("120") ?? false)
    }

    func testRefusesPast500AndSaysSoALaterAcceptedActionClearsTheNotice() {
        let full = run(.empty, .selectAll((1...F.maxEntries).map(bottle)))
        XCTAssertEqual(full.entries.count, F.maxEntries)
        XCTAssertNil(full.notice)
        let refused = run(full, .toggleBottle(bottle(9999)))
        XCTAssertEqual(refused.entries.count, F.maxEntries)
        XCTAssertTrue(refused.notice?.contains("500") ?? false)
        XCTAssertTrue(run(full, .addAdhoc("x")).notice?.contains("500") ?? false)
        XCTAssertEqual(run(full, .addLabel(expressionId: 1, name: "Label 1")).entries.count, F.maxEntries)
        XCTAssertNil(run(refused, .remove(key: PickedEntry.bottle(bottle(1)).key)).notice)
    }

    func testSelectAllStopsAtTheCapAndReportsThatSomeWereLeftOut() {
        let near = run(.empty, .selectAll((1..<F.maxEntries).map(bottle)))
        let out = run(near, .selectAll([bottle(1000), bottle(1001), bottle(1002)]))
        XCTAssertEqual(out.entries.count, F.maxEntries)
        XCTAssertTrue(out.notice?.contains("500") ?? false)
    }

    // Value types cannot be mutated through the reducer; this pins that the earlier value is untouched.
    func testDoesNotChangeTheStateItWasGiven() {
        let state = run(.empty, .toggleBottle(bottle(1)))
        let snapshot = state
        _ = run(state, .toggleBottle(bottle(2)), .clear)
        XCTAssertEqual(state, snapshot)
    }

    private var mixed: FieldState {
        run(.empty, .toggleBottle(bottle(1)), .addLabel(expressionId: 7, name: "Label 7"), .addAdhoc("Outside"))
    }

    func testMapsEachEntryToItsAPIInput() {
        XCTAssertEqual(F.toEntryInputs(mixed.entries), [.bottle(1), .label(7), .outside("Outside")])
    }

    func testCountsByKind() {
        XCTAssertEqual(F.counts(mixed.entries), FieldCounts(bottles: 1, labels: 1, adhoc: 1, total: 3))
        XCTAssertEqual(F.counts([]), FieldCounts(bottles: 0, labels: 0, adhoc: 0, total: 0))
    }

    func testCountsHowManyOfTheShownBottlesAreChosen() {
        XCTAssertEqual(F.chosenAmong(mixed.entries, shown: [1, 2]), 1)
        XCTAssertEqual(F.chosenAmong([], shown: [1]), 0)
    }

    // MARK: fieldFromEntries

    private func entry(_ id: Int, _ kind: EntryKind, _ name: String, _ bottleId: Int?, _ expressionId: Int?, _ status: EntryStatus = .active) -> TournamentEntry {
        TournamentEntry(id: id, name: name, status: status, kind: kind, bottleId: bottleId, expressionId: expressionId)
    }

    func testMapsBottleLabelOnlyAndOutsideEntriesInOrderAndRoundTripsThroughInputs() {
        let state = F.fieldFromEntries([entry(1, .bottle, "A Rye", 5, 50), entry(2, .label, "B Bourbon", nil, 60), entry(3, .adhoc, "  Joe's  cask ", nil, nil)])
        XCTAssertEqual(state.entries, [
            .bottle(PickedBottle(bottleId: 5, expressionId: 50, name: "A Rye")),
            .label(PickedLabel(expressionId: 60, name: "B Bourbon")),
            .adhoc(PickedAdhoc(key: "joe's cask", name: "  Joe's  cask ")),
        ])
        XCTAssertNil(state.notice)
        XCTAssertEqual(F.toEntryInputs(state.entries), [.bottle(5), .label(60), .outside("  Joe's  cask ")])
    }

    func testStartsTheReducerAsItWasLeft() {
        let state = F.fieldFromEntries([entry(1, .bottle, "A Rye", 5, 50), entry(2, .label, "B Bourbon", nil, 60)])
        XCTAssertEqual(run(state, .toggleBottle(PickedBottle(bottleId: 5, expressionId: 50, name: "A Rye"))).entries.count, 1)
        XCTAssertEqual(run(state, .addLabel(expressionId: 60, name: "B Bourbon")).notice, "That label is already in the field.")
    }

    func testLeavesOutWithdrawnEntriesAndAnEmptyFieldIsTheEmptyState() {
        XCTAssertEqual(F.fieldFromEntries([entry(1, .bottle, "Gone", 5, 50, .withdrawn)]).entries, [])
        XCTAssertEqual(F.fieldFromEntries([]), FieldState.empty)
    }
}
