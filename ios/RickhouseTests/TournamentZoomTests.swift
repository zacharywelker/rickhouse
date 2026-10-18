import XCTest
@testable import Rickhouse

// No web twin: the web has no zoom levels (spec section 4, "Phone zoom").
final class TournamentZoomTests: XCTestCase {
    // MARK: levels and the store

    func testZoomInGoesTowardDetailAndOutTowardMapAndBothClamp() {
        XCTAssertEqual(ZoomLevel.map.zoomedIn, .compact)
        XCTAssertEqual(ZoomLevel.compact.zoomedIn, .detail)
        XCTAssertEqual(ZoomLevel.detail.zoomedIn, .detail)
        XCTAssertEqual(ZoomLevel.detail.zoomedOut, .compact)
        XCTAssertEqual(ZoomLevel.compact.zoomedOut, .map)
        XCTAssertEqual(ZoomLevel.map.zoomedOut, .map)
        XCTAssertFalse(ZoomLevel.detail.canZoomIn)
        XCTAssertTrue(ZoomLevel.detail.canZoomOut)
        XCTAssertFalse(ZoomLevel.map.canZoomOut)
        XCTAssertTrue(ZoomLevel.map.canZoomIn)
    }

    func testEachLevelShowsItsOwnFields() {
        XCTAssertEqual(ZoomLevel.detail.rowFields, [.name, .proof, .mashbill, .age])
        XCTAssertEqual(ZoomLevel.compact.rowFields, [.place, .name, .proof])
        XCTAssertEqual(ZoomLevel.map.rowFields, [])
    }

    private func store() -> UserDefaultsZoomStore {
        let suite = "zoom-tests-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: suite)!
        addTeardownBlock { d.removePersistentDomain(forName: suite) }
        return UserDefaultsZoomStore(defaults: d)
    }

    func testTheLevelIsRememberedPerTournamentAndDefaultsToDetail() {
        let s = store()
        XCTAssertEqual(s.level(forTournament: 1), .detail)
        s.set(.map, forTournament: 1)
        s.set(.compact, forTournament: 2)
        XCTAssertEqual(s.level(forTournament: 1), .map)
        XCTAssertEqual(s.level(forTournament: 2), .compact)
        XCTAssertEqual(s.level(forTournament: 3), .detail)
    }

    func testAnUnreadableStoredValueFallsBackToDetail() {
        let suite = "zoom-tests-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: suite)!
        addTeardownBlock { d.removePersistentDomain(forName: suite) }
        d.set(99, forKey: UserDefaultsZoomStore.key(1))
        XCTAssertEqual(UserDefaultsZoomStore(defaults: d).level(forTournament: 1), .detail)
    }

    // MARK: projections

    private func entries(_ names: [String], from first: Int = 1, status: HeatStatus = .pending) -> [HeatEntry] {
        names.enumerated().map { Fx.entry(first + $0.offset, $0.element, 90 + Double($0.offset), place: status == .decided ? $0.offset + 1 : nil) }
    }

    /// Three decided flights in round 1, two in round 2 (one decided, one pending), a hidden one in a blind round 3.
    private var mid: TournamentView {
        let r1 = (1...3).map { Fx.heat($0, 1, $0, entries(["R1 bottle \($0)a", "R1 bottle \($0)b"], from: $0 * 10, status: .decided), status: .decided, band: "90 to 91 proof") }
        let r2 = [
            Fx.heat(4, 2, 1, entries(["Alpha", "Beta"], from: 50, status: .decided), status: .decided, auto: "Wheated"),
            Fx.heat(5, 2, 2, entries(["Gamma", "Delta"], from: 60), band: "92 to 93 proof"),
            Fx.heat(6, 2, 3, [], band: "100 proof", hidden: true, count: 2),
        ]
        return Fx.view(.active, rounds: [TournamentRound(round: 1, heats: r1), TournamentRound(round: 2, heats: r2)], current: 2, blind: true)
    }

    func testTheMapHasASummaryRowForFinishedRoundsTilesForTheCurrentRoundAndCountsForLaterOnes() {
        let rows = ZoomProjection.map(TournamentBracketModel.build(mid))
        XCTAssertEqual(rows.count, 3)
        XCTAssertEqual(rows[0], .finished(summary: "Round 1 · 3 flights · decided"))
        guard case .current(let heading, let tiles) = rows[1] else { return XCTFail("expected the current round") }
        XCTAssertEqual(heading, "Round 2")
        XCTAssertEqual(tiles.map(\.status), [.decided, .pending, .hidden])
        XCTAssertEqual(tiles.map(\.markers), [2, 2, 2])
        XCTAssertEqual(tiles.map(\.text), ["Wheated", "92 to 93 proof", "100 proof"])
        XCTAssertEqual(rows[2], .later(heading: "Final", count: "3 bottles", detail: "Final flight"))
    }

    func testFinishedRoundsReadRoundsOneAndTwoThenOneToN() {
        func finished(_ n: Int) -> String? {
            let done = (1...n).map { r in TournamentRound(round: r, heats: [Fx.heat(r * 10, r, 1, entries(["a\(r)", "b\(r)"], from: r * 10, status: .decided), status: .decided), Fx.heat(r * 10 + 1, r, 2, entries(["c\(r)", "d\(r)"], from: r * 10 + 5, status: .decided), status: .decided)]) }
            let pending = TournamentRound(round: n + 1, heats: [Fx.heat(900, n + 1, 1, entries(["z", "y"], from: 900))])
            let model = TournamentBracketModel.build(Fx.view(.active, rounds: done + [pending], current: n + 1))
            if case .finished(let s)? = ZoomProjection.map(model).first { return s }
            return nil
        }
        XCTAssertEqual(finished(1), "Round 1 · 2 flights · decided")
        XCTAssertEqual(finished(2), "Rounds 1 and 2 · 4 flights · decided")
        XCTAssertEqual(finished(3), "Rounds 1 to 3 · 6 flights · decided")
    }

    func testADraftMapShowsRoundOneAsTilesAndNoSummary() {
        let v = Fx.view(.draft, rounds: [TournamentRound(round: 1, heats: [Fx.heat(1, 1, 1, entries(["a", "b", "c", "d"])), Fx.heat(2, 1, 2, entries(["e", "f"]))])], current: 1)
        let rows = ZoomProjection.map(TournamentBracketModel.build(v))
        guard case .current(_, let tiles)? = rows.first else { return XCTFail("expected tiles first") }
        XCTAssertEqual(tiles.map(\.markers), [4, 2])
        XCTAssertEqual(rows.count, 2)
    }

    func testAFinishedTournamentsMapEndsOnTheFinalsTile() {
        let final = Fx.heat(9, 2, 1, entries(["A", "B"], status: .decided), status: .decided, band: "90 proof")
        let first = Fx.heat(1, 1, 1, entries(["C", "D"], from: 5, status: .decided), status: .decided)
        let second = Fx.heat(2, 1, 2, entries(["E", "F"], from: 8, status: .decided), status: .decided)
        let v = Fx.view(.complete, rounds: [TournamentRound(round: 1, heats: [first, second]), TournamentRound(round: 2, heats: [final])], current: 2)
        let rows = ZoomProjection.map(TournamentBracketModel.build(v))
        XCTAssertEqual(rows.count, 2)
        guard case .current(let heading, let tiles) = rows[1] else { return XCTFail("expected the final") }
        XCTAssertEqual(heading, "Final")
        XCTAssertEqual(tiles.map(\.status), [.decided])
    }

    func testTheMapCarriesNoBottleText() {
        let text = "\(ZoomProjection.map(TournamentBracketModel.build(mid)))"
        for name in ["R1 bottle", "Alpha", "Beta", "Gamma", "Delta"] { XCTAssertFalse(text.contains(name), name) }
    }

    func testCompactGivesPlaceNameAndProofPerRow() {
        let flights = ZoomProjection.compact(TournamentBracketModel.build(mid), round: 2)
        XCTAssertEqual(flights.count, 3)
        XCTAssertEqual(flights[0].rows, [CompactRow(entryId: 50, place: 1, name: "Alpha", proof: "90"), CompactRow(entryId: 51, place: 2, name: "Beta", proof: "91")])
        XCTAssertEqual(flights[1].rows.map(\.place), [nil, nil])
        XCTAssertEqual(flights[1].rows.map(\.name), ["Gamma", "Delta"])
    }

    func testAHiddenFlightShowsItsBandAndCountAtEveryLevelNeverAName() {
        let v = Fx.view(.active, rounds: [TournamentRound(round: 1, heats: [Fx.heat(1, 1, 1, [Fx.entry(7, "Secret Barrel", 100)], label: "Secret pick", auto: "Secret", band: "100 proof", hidden: true, count: 1)])], current: 1, blind: true)
        let model = TournamentBracketModel.build(v)
        let compact = ZoomProjection.compact(model, round: 1)
        XCTAssertEqual(compact[0].title, "100 proof")
        XCTAssertEqual(compact[0].rows, [])
        XCTAssertEqual(compact[0].count, 1)
        for text in ["\(compact)", "\(ZoomProjection.map(model))", "\(model)"] {
            XCTAssertFalse(text.contains("Secret"), text)
        }
    }
}
