import XCTest
@testable import Rickhouse

// Mirrors src/lib/tournaments/__tests__/bracket-model.test.ts (and the rounds helpers it leans on).
final class TournamentBracketModelTests: XCTestCase {
    private typealias B = TournamentBracketModel

    private func column(_ model: BracketModel, _ i: Int) -> RoundColumn {
        guard case .round(let c) = model.columns[i] else { fatalError("column \(i) is planned") }
        return c
    }

    // MARK: flightTitle

    func testFlightTitlePutsYourNameFirstAndMarksItYours() {
        let h = Fx.heat(1, 1, 1, label: "  High rye shelf ", auto: "Low rye", band: "90 proof")
        XCTAssertEqual(B.flightTitle(h, number: 1), FlightTitle(text: "High rye shelf", yours: true))
    }

    func testFlightTitleFallsBackFromGeneratedLabelToBandToNumber() {
        XCTAssertEqual(B.flightTitle(Fx.heat(1, 1, 1, auto: "MGP 95/5", band: "90 proof"), number: 2), FlightTitle(text: "MGP 95/5", yours: false))
        XCTAssertEqual(B.flightTitle(Fx.heat(1, 1, 1, band: "90 to 94 proof"), number: 2), FlightTitle(text: "90 to 94 proof", yours: false))
        XCTAssertEqual(B.flightTitle(Fx.heat(1, 1, 1), number: 2), FlightTitle(text: "Flight 2", yours: false))
    }

    func testFlightTitleShowsOnlyTheBandOnAHiddenFlightEvenWithALabel() {
        let withLabel = Fx.heat(1, 2, 1, label: "Secret pick", band: "90 to 100 proof", hidden: true, count: 4)
        XCTAssertEqual(B.flightTitle(withLabel, number: 1), FlightTitle(text: "90 to 100 proof", yours: false))
        let plain = Fx.heat(1, 2, 1, band: "90 to 100 proof", hidden: true, count: 4)
        XCTAssertEqual(B.flightTitle(plain, number: 1), FlightTitle(text: "90 to 100 proof", yours: false))
    }

    // MARK: formatAge, formatProof

    func testFormatAgeReadsYearsTrimsDecimalsAndDashesUnknown() {
        XCTAssertEqual(B.formatAge(12), "12 yr")
        XCTAssertEqual(B.formatAge(4.5), "4.5 yr")
        XCTAssertEqual(B.formatAge(4.04), "4 yr")
        XCTAssertEqual(B.formatAge(nil), "—")
    }

    // Swift-only: the web gets String(proof) for free.
    func testFormatProofPrintsWholeNumbersWithoutADecimalPoint() {
        XCTAssertEqual(B.formatProof(100), "100")
        XCTAssertEqual(B.formatProof(92.5), "92.5")
        XCTAssertEqual(B.formatProof(nil), "—")
    }

    // MARK: advanceNote and plannedRounds

    func testAdvanceNoteStatesTheCutForEvenAndMixedSizes() {
        XCTAssertEqual(B.advanceNote([4, 4, 4], past: false), "Top 2 of each flight advance")
        XCTAssertEqual(B.advanceNote([3, 3, 2], past: true), "Top 1 of each flight advanced")
        XCTAssertEqual(B.advanceNote([4, 4, 3], past: false), "Flights of 4 advance 2, flights of 3 advance 1")
    }

    func testPlannedRoundsMatchTheEnginesPlan() throws {
        for (n, size) in [(12, 4), (60, 4), (7, 3), (10, 2), (3, 4)] {
            var sizes: [Int] = []
            var left = n
            while left > 0 { sizes.append(min(size, left)); left -= size }
            let plan = try TournamentRounds.planRounds(entrantCount: n, heatSize: size)
            XCTAssertEqual([plan[0]] + B.plannedRounds(lastSizes: sizes, heatSize: size).map(\.flights), plan, "\(n) of \(size)")
        }
    }

    // MARK: a draft preview

    private var draft: TournamentView {
        Fx.view(.draft, rounds: [TournamentRound(round: 1, heats: [
            Fx.heat(1, 1, 1, [Fx.entry(1, "Weller 12", 100, mashbill: "Wheated", age: 12), Fx.entry(2, "Buffalo Trace", 90),
                              Fx.entry(3, "Mystery", nil), Fx.entry(4, "Booker's", 126)]),
            Fx.heat(2, 1, 3, [Fx.entry(5, "Eagle Rare", 90), Fx.entry(6, "Blanton's", 93)], label: "Mine", auto: "Buffalo Trace", band: "90 to 93 proof"),
        ])], current: 1)
    }

    func testListsOpenFlightsLowestProofFirstWithUnknownLast() {
        XCTAssertEqual(column(B.build(draft), 0).flights[0].rows.map(\.name), ["Buffalo Trace", "Weller 12", "Booker's", "Mystery"])
    }

    func testFormatsTheFixedColumnsAndDashesWhatIsUnknown() {
        let rows = column(B.build(draft), 0).flights[0].rows
        let weller = rows.first { $0.name == "Weller 12" }!
        XCTAssertEqual([weller.proof, weller.mashbill, weller.age], ["100", "Wheated", "12 yr"])
        let mystery = rows.first { $0.name == "Mystery" }!
        XCTAssertEqual([mystery.proof, mystery.mashbill, mystery.age], ["—", "—", "—"])
    }

    func testNumbersFlightsByPositionNotSlotAndMarksYours() {
        let model = B.build(draft)
        let first = column(model, 0)
        XCTAssertEqual(first.flights[1].number, 2)
        XCTAssertEqual(first.flights[1].title, FlightTitle(text: "Mine", yours: true))
        XCTAssertEqual(first.flights[1].meta, "Flight 2 · 90 to 93 proof")
        XCTAssertEqual(model.renamed, 1)
        // no band because one proof is unknown, and nothing shared to name it: the number is the title, so it is not said twice
        XCTAssertEqual(first.flights[0].title.text, "Flight 1")
        XCTAssertEqual(first.flights[0].meta, "Proof unknown for some")
    }

    func testCountsBottlesWithoutAProofAndAddsLaterRoundsAsCounts() {
        let model = B.build(draft)
        let first = column(model, 0)
        XCTAssertEqual(model.unknownProof, 1)
        XCTAssertEqual(first.heading, "Round 1")
        XCTAssertNil(first.state)
        XCTAssertEqual(first.count, "6 bottles")
        XCTAssertEqual(first.note, "Flights of 4 advance 2, flights of 2 advance 1")
        XCTAssertEqual(model.columns.count, 2)
        guard case .planned(let later) = model.columns[1] else { return XCTFail("expected a planned column") }
        XCTAssertEqual([later.heading, later.count, later.title, later.fill], ["Final", "3 bottles", "Final flight", "Fills after round 1"])
    }

    func testASingleFlightIsTheFinalWithNoLaterRounds() {
        var v = draft
        v = Fx.view(.draft, rounds: [TournamentRound(round: 1, heats: [v.rounds[0].heats[0]])], current: 1)
        let model = B.build(v)
        XCTAssertEqual(model.columns.count, 1)
        XCTAssertEqual(column(model, 0).heading, "Final")
    }

    // MARK: a running tournament

    private var running: TournamentView {
        let decided = Fx.heat(1, 1, 1, [Fx.entry(1, "Eagle Rare", 90, place: 1), Fx.entry(2, "Maker's", 92, place: 2),
                                         Fx.entry(3, "Russell's", 91, place: 3), Fx.entry(4, "Buffalo Trace", 90, place: 4)],
                              status: .decided, auto: "Low rye", band: "90 to 92 proof")
        let bye = Fx.heat(2, 1, 2, [Fx.entry(9, "Lone bottle", 100)], status: .bye, band: "100 proof")
        let hidden = Fx.heat(3, 2, 1, [], band: "90 to 100 proof", hidden: true, count: 4, glasses: ["A", "B"])
        let other = Fx.heat(4, 2, 2, [], band: "124 to 126 proof", hidden: true, count: 2)
        return Fx.view(.active, rounds: [TournamentRound(round: 1, heats: [decided, bye]), TournamentRound(round: 2, heats: [hidden, other])], current: 2)
    }

    func testShowsPlacesInOrderAndMarksWhoAdvanced() {
        let model = B.build(running)
        let (one, two) = (column(model, 0), column(model, 1))
        XCTAssertEqual(one.flights[0].rows.map { [$0.name, String($0.place ?? 0), String($0.advanced)] },
                       [["Eagle Rare", "1", "true"], ["Maker's", "2", "true"], ["Russell's", "3", "false"], ["Buffalo Trace", "4", "false"]])
        XCTAssertEqual(one.flights[1].rows.map(\.advanced), [true])
        XCTAssertEqual(one.flights[1].meta, "Flight 2 · Bye")
        XCTAssertEqual([one.state, two.state], [.decided, .now])
        XCTAssertEqual(one.note, "Flights of 4 advanced 2, byes advanced 1")
    }

    func testShowsAHiddenFlightAsItsBandOnly() {
        let model = B.build(running)
        let flight = column(model, 1).flights[0]
        XCTAssertTrue(flight.hidden)
        XCTAssertEqual(flight.rows, [])
        XCTAssertEqual(flight.count, 4)
        XCTAssertEqual(flight.glassesSet, 2)
        XCTAssertEqual(flight.title, FlightTitle(text: "90 to 100 proof", yours: false))
        XCTAssertEqual(flight.meta, "Flight 1")
        let plain = column(model, 1).flights[1]
        XCTAssertEqual(plain.title, FlightTitle(text: "124 to 126 proof", yours: false))
        XCTAssertEqual(plain.meta, "Flight 2")
        XCTAssertEqual(model.renamed, 0)
    }

    // Swift-only: the web trusts the server to send no rows for a hidden flight; the phone drops them anyway.
    func testAHiddenFlightNeverShowsRowsEvenIfTheServerSentSome() {
        let leaky = Fx.heat(5, 1, 1, [Fx.entry(7, "Secret Barrel", 100)], band: "100 proof", hidden: true, count: 1)
        let model = B.build(Fx.view(.active, rounds: [TournamentRound(round: 1, heats: [leaky])], current: 1))
        XCTAssertEqual(column(model, 0).flights[0].rows, [])
    }

    func testMarksNobodyAsAdvancingOutOfADecidedFinal() {
        let final = Fx.heat(9, 3, 1, [Fx.entry(1, "Eagle Rare", 90, place: 1), Fx.entry(2, "Maker's", 92, place: 2)], status: .decided, band: "90 to 92 proof")
        let col = column(B.build(Fx.view(.complete, rounds: [TournamentRound(round: 3, heats: [final])], current: 3)), 0)
        XCTAssertEqual(col.heading, "Final")
        XCTAssertEqual(col.flights[0].rows.map(\.advanced), [false, false])
    }

    func testPlansTheRoundsStillToCome() {
        let model = B.build(running)
        XCTAssertEqual(model.columns.map(\.heading), ["Round 1", "Round 2", "Final"])
        guard case .planned(let p) = model.columns[2] else { return XCTFail("expected planned") }
        XCTAssertEqual(p.count, "3 bottles")
    }

    // MARK: rounds (src/lib/tournaments/__tests__/rounds.test.ts, the parts used here)

    func testAdvanceCountAndAdvancers() {
        XCTAssertEqual([1, 2, 3, 4, 5, 6].map(TournamentRounds.advanceCount), [1, 1, 1, 2, 2, 3])
        let placed = [Placing(entryId: 7, place: 3), Placing(entryId: 8, place: 1), Placing(entryId: 9, place: 2), Placing(entryId: 4, place: 4)]
        XCTAssertEqual(TournamentRounds.advancers(placed, bye: false), [8, 9])
        XCTAssertEqual(TournamentRounds.advancers([Placing(entryId: 5, place: nil)], bye: true), [5])
    }

    func testPlanRoundsAndItsGuards() throws {
        XCTAssertEqual(try TournamentRounds.planRounds(entrantCount: 12, heatSize: 4), [3, 2, 1])
        XCTAssertEqual(try TournamentRounds.planRounds(entrantCount: 3, heatSize: 4), [1])
        XCTAssertThrowsError(try TournamentRounds.planRounds(entrantCount: 1, heatSize: 4))
        XCTAssertThrowsError(try TournamentRounds.planRounds(entrantCount: 8, heatSize: 1))
    }
}
