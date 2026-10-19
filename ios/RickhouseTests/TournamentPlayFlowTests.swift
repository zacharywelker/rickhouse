import XCTest
@testable import Rickhouse

// Mirrors src/lib/tournaments/__tests__/play-flow.test.ts, plus the two phone helpers the web did inline (RankList, GlassMapping).
final class TournamentPlayStoppedTests: XCTestCase {
    private func heat(_ round: Int, _ status: HeatStatus) -> TournamentHeat { Fx.heat(1, round, 1, [], status: status) }

    func testStoppedSaysWhyAFlightCannotBePlayed() {
        let running = Fx.view(.active, [[heat(1, .decided)], [heat(2, .pending)]])
        XCTAssertNil(TournamentPlayLogic.stopped(running, running.rounds[1].heats[0]))
        XCTAssertEqual(TournamentPlayLogic.stopped(running, running.rounds[0].heats[0]), .decided)
        let early = Fx.view(.active, [[heat(1, .pending)], [heat(2, .pending)]])
        XCTAssertEqual(TournamentPlayLogic.stopped(early, early.rounds[0].heats[0]), .notCurrent, "a pending flight outside the round being played is not decided")
        XCTAssertNotEqual(PlayStopped.notCurrent.text, PlayStopped.decided.text)
        let draft = Fx.view(.draft, [[heat(1, .pending)]])
        XCTAssertEqual(TournamentPlayLogic.stopped(draft, draft.rounds[0].heats[0]), .notRunning)
    }
}

final class TournamentPlayFlowTests: XCTestCase {
    private typealias P = TournamentPlayFlow
    private func row(_ id: Int, _ name: String, _ glass: String) -> MappingRow {
        MappingRow(entryId: id, name: name, proof: 100, mashbill: nil, ageYears: nil, glass: glass)
    }
    private func mapping(_ rows: [MappingRow], saved: Bool = true) -> Flow { .mapping(rows: rows, saved: saved, base: rows.map(\.glass)) }
    private func rows(of flow: Flow) -> [MappingRow] { if case .mapping(let r, _, _) = flow { r } else { [] } }
    private func sent(_ flow: Flow) -> [SentGlass] { rows(of: flow).map { SentGlass(entryId: $0.entryId, glass: $0.glass) } }
    private func saved(_ flow: Flow) -> Bool? { if case .mapping(_, let s, _) = flow { s } else { nil } }

    // MARK: RankList (moveItem)

    func testMoveSwapsWithTheNeighbourAndStopsAtTheEnds() {
        XCTAssertEqual(RankList.move(["a", "b", "c"], index: 1, delta: -1), ["b", "a", "c"])
        XCTAssertEqual(RankList.move(["a", "b", "c"], index: 1, delta: 1), ["a", "c", "b"])
        XCTAssertEqual(RankList.move(["a", "b", "c"], index: 0, delta: -1), ["a", "b", "c"])
        XCTAssertEqual(RankList.move(["a", "b", "c"], index: 2, delta: 1), ["a", "b", "c"])
    }

    func testMoveWorksOnIdsAndIgnoresABadIndexOrDelta() {
        XCTAssertEqual(RankList.move([10, 20, 30], index: 0, delta: 1), [20, 10, 30])
        XCTAssertEqual(RankList.move([10, 20, 30], index: 7, delta: 1), [10, 20, 30])
        XCTAssertEqual(RankList.move([10, 20, 30], index: -1, delta: 1), [10, 20, 30])
        XCTAssertEqual(RankList.move([10, 20, 30], index: 1, delta: 2), [10, 20, 30])
        XCTAssertEqual(RankList.move([10, 20, 30], index: 1, delta: 0), [10, 20, 30])
    }

    func testCanMoveSaysWhichArrowsAreLive() {
        XCTAssertFalse(RankList.canMove(count: 3, index: 0, delta: -1))
        XCTAssertTrue(RankList.canMove(count: 3, index: 0, delta: 1))
        XCTAssertFalse(RankList.canMove(count: 3, index: 2, delta: 1))
        XCTAssertTrue(RankList.canMove(count: 3, index: 2, delta: -1))
    }

    // MARK: letters

    func testLettersRunFromAUpToFour() {
        XCTAssertEqual(GlassMapping.letters(3), ["A", "B", "C"])
        XCTAssertEqual(GlassMapping.letters(2), ["A", "B"])
        XCTAssertEqual(GlassMapping.letters(9), ["A", "B", "C", "D"])
    }

    func testAShuffleUsesEachLetterOnce() {
        for _ in 0..<20 { XCTAssertEqual(GlassMapping.shuffled(4).sorted(), ["A", "B", "C", "D"]) }
        var zero = ScriptedGenerator(values: [0])
        XCTAssertEqual(GlassMapping.shuffled(3, using: &zero), ["B", "C", "A"])
    }

    func testProblemsMissingOutsideTheSetRepeated() {
        XCTAssertNil(GlassMapping.problem(["A", "B", "C"]))
        XCTAssertNil(GlassMapping.problem(["C", "A", "B"]))
        XCTAssertTrue(GlassMapping.problem(["A", "A", "B"])?.contains("own letter") ?? false)
        XCTAssertTrue(GlassMapping.problem(["A", "D", "B"])?.contains("from A, B, C") ?? false)
        XCTAssertTrue(GlassMapping.problem(["A", nil])?.contains("from A, B") ?? false)
    }

    // Swift-only
    func testIsCompleteIsTheProblemFreeCase() {
        XCTAssertTrue(GlassMapping.isComplete(["B", "A"]))
        XCTAssertFalse(GlassMapping.isComplete(["A", "A"]))
        XCTAssertFalse(GlassMapping.isComplete([nil, "A"]))
    }

    // Swift-only: picking a letter another bottle holds hands that bottle this bottle's old letter, so the set stays unique.
    func testAssigningATakenLetterSwapsWithItsHolder() {
        XCTAssertEqual(GlassMapping.assign(["B", "A", "C"], index: 0, letter: "C"), ["C", "A", "B"])
        XCTAssertEqual(GlassMapping.assign(["B", "A", "C"], index: 0, letter: "B"), ["B", "A", "C"])
        XCTAssertEqual(GlassMapping.assign(["B", "A"], index: 5, letter: "A"), ["B", "A"])
    }

    // MARK: flowReducer

    private let sample = ["Old Forester", "Four Roses", "Wild Turkey"]
    private var sampleRows: [MappingRow] { [row(1, sample[0], "B"), row(2, sample[1], "A"), row(3, sample[2], "C")] }

    func testStartsAtStartOrLoadingWhenThePourerDrewTheFlight() {
        XCTAssertEqual(P.initialFlow(drawn: false), .start)
        XCTAssertEqual(P.initialFlow(drawn: true), .loading)
    }

    func testGoesStartLoadingMappingAndBackToStartWhenLoadingFails() {
        let loading = P.reduce(.start, .show)
        XCTAssertEqual(loading, .loading)
        XCTAssertEqual(P.reduce(loading, .failed), .start)
        XCTAssertEqual(P.reduce(loading, .loaded(sampleRows)), mapping(sampleRows))
        XCTAssertEqual(P.reduce(.start, .loaded(sampleRows)), .start, "loaded is ignored outside loading")
    }

    func testEditingALetterMakesTheMappingUnsavedSavingMakesItSaved() {
        let edited = P.reduce(mapping(sampleRows), .setGlass(entryId: 1, glass: "D"))
        XCTAssertEqual(saved(edited), false)
        XCTAssertEqual(rows(of: edited).map(\.glass), ["D", "A", "C"])
        XCTAssertEqual(saved(P.reduce(edited, .saved(sent: sent(edited)))), true)
        // putting the letter back to what the server has counts as saved again
        XCTAssertEqual(saved(P.reduce(edited, .setGlass(entryId: 1, glass: "B"))), true)
        let all = P.reduce(mapping(sampleRows), .setAll(["C", "B", "A"]))
        XCTAssertEqual(rows(of: all).map(\.glass), ["C", "B", "A"])
        XCTAssertEqual(saved(all), false)
    }

    func testALetterChangedWhileASaveIsPendingStaysUnsavedWhenTheOldSaveResolves() {
        let first = P.reduce(mapping(sampleRows), .setGlass(entryId: 1, glass: "D"))
        let pending = sent(first)
        let during = P.reduce(first, .setGlass(entryId: 2, glass: "B"))
        let after = P.reduce(during, .saved(sent: pending))
        guard case .mapping(let r, let isSaved, let base) = after else { return XCTFail("not mapping") }
        XCTAssertFalse(isSaved)
        XCTAssertEqual(base, ["D", "A", "C"])
        XCTAssertEqual(r.map(\.glass), ["D", "B", "C"])
        XCTAssertEqual(P.reduce(after, .hide), after)
    }

    func testHideDropsTheNamesTheRankStateHoldsOnlyLettersInOrder() {
        let ranked = P.reduce(mapping(sampleRows), .hide)
        XCTAssertEqual(ranked, .rank(order: ["A", "B", "C"]))
        let text = "\(ranked)"
        for name in sample { XCTAssertFalse(text.contains(name)) }
    }

    func testHideIsRefusedWhileTheLettersAreUnsavedOrInvalid() {
        let unsaved = mapping(sampleRows, saved: false)
        XCTAssertEqual(P.reduce(unsaved, .hide), unsaved)
        let repeated = mapping([row(1, "a", "A"), row(2, "b", "A")])
        XCTAssertEqual(P.reduce(repeated, .hide), repeated)
    }

    func testRankingMovesLettersAndRecordsIntoRevealedNamesCannotComeBack() {
        var s: Flow = .rank(order: ["A", "B", "C"])
        s = P.reduce(s, .move(index: 2, delta: -1))
        s = P.reduce(s, .move(index: 0, delta: -1))
        XCTAssertEqual(s, .rank(order: ["A", "C", "B"]))
        XCTAssertEqual(P.reduce(s, .recorded), .revealed)
        XCTAssertEqual(P.reduce(.revealed, .move(index: 0, delta: 1)), .revealed)
        XCTAssertEqual(P.reduce(.rank(order: ["A"]), .show), .rank(order: ["A"]))
    }
}
