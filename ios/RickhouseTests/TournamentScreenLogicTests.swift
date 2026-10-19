import XCTest
@testable import Rickhouse

final class TournamentScreenLogicTests: XCTestCase {
    private typealias L = TournamentScreenLogic

    private func e(_ id: Int, _ name: String, _ proof: Double?, place: Int? = nil) -> HeatEntry { Fx.entry(id, name, proof, place: place) }

    /// A draft of flights of 2: [A B], [C], [D E].
    private func draft(size: Int = 2, order: [String]? = nil) -> TournamentView {
                return Fx.view(.draft, rounds: Fx.rounds([[
            Fx.heat(10, 1, 1, [e(1, "A", 90), e(2, "B", 91)], label: "Mine"),
            Fx.heat(11, 1, 2, [e(3, "C", 92)]),
            Fx.heat(12, 1, 3, [e(4, "Dee", 93), e(5, "Éclair", 94)]),
        ]]), current: .some(nil), heatSize: size, order: order, entries: Fx.people + [
            TournamentEntry(id: 3, name: "C", status: .active, kind: .bottle, bottleId: 3, expressionId: 3),
        ])
    }

    private func column(_ view: TournamentView) -> RoundColumn {
        guard case .round(let c) = TournamentBracketModel.build(view).columns[0] else { fatalError("no round") }
        return c
    }

    func testMoveTargetsListOtherFlightsAndMarkFullOnes() {
        let v = draft()
        let c = column(v)
        let targets = L.moveTargets(c, from: c.flights[0], heatSize: 2)
        XCTAssertEqual(targets.map(\.heatId), [11, 12])
        XCTAssertEqual(targets.map(\.full), [false, true])
        XCTAssertTrue(targets[0].title.hasPrefix("Flight 2 · "))
    }

    func testMoveAndSwapSkipDecidedAndHiddenFlights() {
                let v = Fx.view(.active, rounds: Fx.rounds([[
            Fx.heat(10, 1, 1, [e(1, "A", 90), e(2, "B", 91)]),
            Fx.heat(11, 1, 2, [e(3, "C", 92, place: 1), e(4, "D", 93, place: 2)], status: .decided),
            Fx.heat(12, 1, 3, [], band: "90 to 94 proof", hidden: true, count: 2),
        ]]), heatSize: 2)
        let c = column(v)
        XCTAssertEqual(L.moveTargets(c, from: c.flights[0], heatSize: 2), [])
        XCTAssertEqual(L.swapTargets(c, from: c.flights[0]), [])
    }

    func testSwapTargetsNameEachBottleOfTheOtherFlights() {
        let c = column(draft())
        let swaps = L.swapTargets(c, from: c.flights[1])
        XCTAssertEqual(swaps.map(\.entryId), [1, 2, 4, 5])
        XCTAssertEqual(swaps.map(\.flight), ["Flight 1", "Flight 1", "Flight 3", "Flight 3"])
    }

    func testFilterSwapsNeedsEveryWordAndIgnoresCaseAndAccents() {
        let swaps = L.swapTargets(column(draft()), from: column(draft()).flights[1])
        XCTAssertEqual(L.filterSwaps(swaps, query: "  ").count, 4)
        XCTAssertEqual(L.filterSwaps(swaps, query: "ECLAIR").map(\.entryId), [5])
        XCTAssertEqual(L.filterSwaps(swaps, query: "dee zz").map(\.entryId), [])
        XCTAssertEqual(L.filterSwaps(swaps, query: "zzz"), [])
    }

    func testFlightLabelTrimsCutsAndClears() {
        XCTAssertNil(L.flightLabel(from: "   "))
        XCTAssertEqual(L.flightLabel(from: "  Rye night "), "Rye night")
        XCTAssertEqual(L.flightLabel(from: String(repeating: "x", count: 120))?.count, 80)
    }

    func testRoundOptionsAndTheRoundShown() {
        let v = draft()
        let opts = L.roundOptions(TournamentBracketModel.build(v))
        XCTAssertEqual(opts.first?.round, 1)
        XCTAssertEqual(L.effectiveRound(v, options: opts, chosen: nil), 1)
        XCTAssertEqual(L.effectiveRound(v, options: opts, chosen: 1), 1)
        XCTAssertEqual(L.effectiveRound(v, options: opts, chosen: 99), 1, "a round that no longer exists is ignored")
        XCTAssertNil(L.effectiveRound(v, options: [], chosen: nil))
    }

    func testStartNeedsTwoActiveEntriesAndSaysWhy() {
        let two = draft()
        XCTAssertTrue(L.canStart(two))
        XCTAssertNil(L.barNote(two, renamed: 0))
        XCTAssertEqual(L.barNote(two, renamed: 1), "1 flight renamed.")
        let one = Fx.view(.draft, rounds: [], entries: Fx.people)
        XCTAssertFalse(L.canStart(one))
        XCTAssertEqual(L.barNote(one, renamed: 0), "Starting needs at least 2 entries.")
        XCTAssertFalse(L.canStart(Fx.view(.active, rounds: [], entries: Fx.people + Fx.people)))
    }

    func testSettingsPatchHoldsOnlyWhatChanged() {
        let v = draft()
        var s = SettingsDraft(v)
        XCTAssertNil(s.patch(against: v))
        s.name = "  New name "
        s.blind = true
        s.note = "from the shelf"
        XCTAssertEqual(s.patch(against: v), TournamentPatch(name: "New name", blind: true, fieldNote: .some("from the shelf")))
        XCTAssertFalse(s.regroups(against: v), "name, blind and the note do not regroup")
        s.blind = false
        s.name = v.name
        s.note = "  "
        XCTAssertNil(s.patch(against: v), "a blank note is no change to a draft without one")
    }

    func testOnlySizeSeedingAndOrderRegroupAndWarnAboutNames() {
        let v = draft()
        var s = SettingsDraft(v)
        XCTAssertNil(L.regroupWarning(s, view: v, renamed: 1))
        s.heatSize = 3
        XCTAssertTrue(s.regroups(against: v))
        XCTAssertEqual(L.regroupWarning(s, view: v, renamed: 1), "Saving regroups the flights and clears the flight name you gave.")
        XCTAssertEqual(L.regroupWarning(s, view: v, renamed: 3), "Saving regroups the flights and clears the 3 flight names you gave.")
        XCTAssertNil(L.regroupWarning(s, view: v, renamed: 0))
        s = SettingsDraft(v)
        s.seeding = .random
        XCTAssertTrue(s.regroups(against: v))
        s = SettingsDraft(v)
        s.groupOrder = v.groupOrder.reversed()
        XCTAssertTrue(s.regroups(against: v))
    }

    func testBlankNameIsNotValid() {
        var s = SettingsDraft(draft())
        XCTAssertTrue(s.isValid)
        s.name = "   "
        XCTAssertFalse(s.isValid)
    }

    func testFieldPatchOnlyWhenTheFieldChanged() {
        let v = draft()
        let same = TournamentFieldSelection.fieldFromEntries(v.entries)
        XCTAssertNil(L.fieldPatch(original: v.entries, edited: same))
        var edited = same
        edited.entries = []
        XCTAssertEqual(L.fieldPatch(original: v.entries, edited: edited), TournamentPatch(entries: []))
    }

    func testHeaderMetaAndStatusLine() {
        XCTAssertEqual(L.headerMeta(draft()), "Draft · 2 bottles · flights of 2")
        XCTAssertNil(L.statusLine(draft()))
        let random = Fx.view(.draft, rounds: [], heatSize: 3, seeding: .random)
        XCTAssertTrue(L.headerMeta(random).hasSuffix("flights of 3 · random seeding"))
    }

    func testTileStatusWords() {
        XCTAssertEqual(L.tileStatusText(.pending, draft: true), "Not started")
        XCTAssertEqual(L.tileStatusText(.pending, draft: false), "To taste")
        XCTAssertEqual(L.tileStatusText(.hidden, draft: false), "To taste")
        XCTAssertEqual(L.tileStatusText(.decided, draft: false), "Decided")
        XCTAssertEqual(L.tileStatusText(.bye, draft: false), "Bye")
    }
}
