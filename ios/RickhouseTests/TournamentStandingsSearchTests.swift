import XCTest
@testable import Rickhouse

// Mirrors standings-model.test.ts, bracket-search.test.ts and priority.test.ts.
final class TournamentStandingsSearchTests: XCTestCase {
    // MARK: standings

    private func s(_ id: Int, _ name: String, _ rank: Int, _ round: Int, _ place: Int?) -> TournamentStanding {
        TournamentStanding(entryId: id, name: name, rank: rank, round: round, place: place)
    }
    private func rounds(_ n: Int) -> [TournamentRound] { (1...n).map { TournamentRound(round: $0, heats: []) } }

    func testStandingsAreEmptyBeforeAnyFlightIsDecided() {
        XCTAssertEqual(TournamentStandings.rows(Fx.view(.active, rounds: rounds(1))), [])
    }

    func testMarksSharedPlacesWithEqualsAndKeepsTheEnginesSkip() {
        let v = Fx.view(.active, rounds: rounds(2), standings: [s(1, "A", 1, 2, 1), s(2, "B", 2, 2, 2), s(3, "C", 3, 1, 3), s(4, "D", 3, 1, 3), s(5, "E", 5, 1, 4)])
        XCTAssertEqual(TournamentStandings.rows(v).map { [$0.place, $0.name] }, [["1", "A"], ["2", "B"], ["3=", "C"], ["3=", "D"], ["5", "E"]])
    }

    func testSaysWhereEachLeftAndNamesTheChampionOnceFinished() {
        let v = Fx.view(.complete, rounds: rounds(2), standings: [s(1, "A", 1, 2, 1), s(2, "B", 2, 2, 2), s(3, "C", 3, 1, 3)],
                        champion: TournamentChampion(entryId: 1, name: "A"))
        let rows = TournamentStandings.rows(v)
        XCTAssertEqual(rows.map(\.left), ["Champion", "Out in the final", "Out in round 1"])
        XCTAssertEqual(rows.map(\.champion), [true, false, false])
    }

    func testWhileRunningNobodyIsOutYetItSaysWhereEachLastPoured() {
        let v = Fx.view(.active, rounds: rounds(2), standings: [s(1, "A", 1, 1, 1), s(2, "B", 2, 1, 2)])
        let rows = TournamentStandings.rows(v)
        XCTAssertTrue(rows.allSatisfy { !$0.champion })
        XCTAssertEqual(rows[0].left, "Last flight: round 1")
    }

    // MARK: search

    private func e(_ id: Int, _ name: String) -> HeatEntry { Fx.entry(id, name, nil) }
    private var searchView: TournamentView {
        Fx.view(.active, rounds: [
            TournamentRound(round: 1, heats: [
                Fx.heat(1, 1, 1, [e(1, "Eagle Rare 10"), e(2, "Blanton's")]),
                Fx.heat(2, 1, 2, [e(3, "Pàppy Van Winkle"), e(4, "Eagle Rare 17")]),
            ]),
            TournamentRound(round: 2, heats: [Fx.heat(3, 2, 3, [], hidden: true, count: 2)]),
        ])
    }

    func testFindsNamesInPageOrderIgnoringCaseAndAccents() {
        XCTAssertEqual(TournamentSearch.matchEntries(searchView, "eagle"), [Match(entryId: 1, heatId: 1, round: 1), Match(entryId: 4, heatId: 2, round: 1)])
        XCTAssertEqual(TournamentSearch.matchEntries(searchView, "PAPPY"), [Match(entryId: 3, heatId: 2, round: 1)])
    }

    func testNeedsEveryWordInAnyOrder() {
        XCTAssertEqual(TournamentSearch.matchEntries(searchView, "rare 17").map(\.entryId), [4])
        XCTAssertEqual(TournamentSearch.matchEntries(searchView, "17 eagle").map(\.entryId), [4])
        XCTAssertEqual(TournamentSearch.matchEntries(searchView, "eagle pappy"), [])
    }

    func testBlankQueryMatchesNothing() {
        XCTAssertEqual(TournamentSearch.matchEntries(searchView, "   "), [])
    }

    func testNeverMatchesAHiddenFlightAndNoHiddenNameCanLeak() {
        let leaky = Fx.heat(9, 1, 1, [e(7, "Secret Barrel")], hidden: true, count: 1)
        let v = Fx.view(.active, rounds: [TournamentRound(round: 1, heats: [leaky])])
        XCTAssertEqual(TournamentSearch.matchEntries(v, "secret"), [])
        XCTAssertFalse("\(TournamentSearch.matchEntries(searchView, "e"))".contains("Secret"))
    }

    func testFoldRemovesAccentsAndCase() {
        XCTAssertEqual(TournamentSearch.fold("Pàppy VAN"), "pappy van")
    }

    func testStepMatchStartsAtTheFirstGoingOnTheLastGoingBackAndWraps() {
        XCTAssertEqual(TournamentSearch.stepMatch(count: 3, current: nil, direction: 1), 0)
        XCTAssertEqual(TournamentSearch.stepMatch(count: 3, current: nil, direction: -1), 2)
        XCTAssertEqual(TournamentSearch.stepMatch(count: 3, current: 2, direction: 1), 0)
        XCTAssertEqual(TournamentSearch.stepMatch(count: 3, current: 0, direction: -1), 2)
        XCTAssertNil(TournamentSearch.stepMatch(count: 0, current: nil, direction: 1))
    }

    // MARK: priority

    private let order = TournamentPriority.defaultOrder

    func testEveryKeyHasACapitalisedLabelAndAHelpLine() throws {
        XCTAssertEqual(Set(TournamentPriority.labels.keys), Set(TournamentPriority.keys))
        XCTAssertEqual(Set(TournamentPriority.help.keys), Set(TournamentPriority.keys))
        for key in TournamentPriority.keys { XCTAssertTrue(try XCTUnwrap(TournamentPriority.labels[key]?.first).isUppercase) }
    }

    func testMoveKeyMovesDownAndUpByOnePlace() {
        XCTAssertEqual(TournamentPriority.moveKey(order, 0, 1), ["mashbill", "proof", "distillery", "age", "finish"])
        XCTAssertEqual(TournamentPriority.moveKey(order, 3, -1), ["proof", "mashbill", "age", "distillery", "finish"])
    }

    func testMoveKeyDoesNothingAtTheEndsAndForABadIndex() {
        XCTAssertEqual(TournamentPriority.moveKey(order, 0, -1), order)
        XCTAssertEqual(TournamentPriority.moveKey(order, 4, 1), order)
        XCTAssertEqual(TournamentPriority.moveKey(order, 9, 1), order)
        XCTAssertEqual(TournamentPriority.moveKey(order, -1, 1), order)
        XCTAssertEqual(TournamentPriority.moveKey(order, 1, 0), order)
    }

    func testMoveKeyKeepsAValidOrder() {
        XCTAssertTrue(TournamentPriority.isGroupOrder(TournamentPriority.moveKey(order, 1, 1)))
        XCTAssertFalse(TournamentPriority.isGroupOrder(["proof", "proof", "age", "finish", "mashbill"]))
        XCTAssertFalse(TournamentPriority.isGroupOrder(["proof"]))
    }
}
