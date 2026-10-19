import XCTest
@testable import Rickhouse

final class TournamentModelsTests: XCTestCase {
    private func decode<T: Decodable>(_ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func testAStatusANewerServerAddsDecodesAsUnknownInsteadOfFailing() throws {
        let odd = heat(id: 1, status: "skipped", entries: [])
        let entries = #"[{"id":1,"name":"A","status":"banned","kind":"cask","bottleId":null,"expressionId":null}]"#
        let v: TournamentView = try decode(view(status: "paused", entries: entries, rounds: #"[{"round":1,"heats":[\#(odd)]}]"#))
        XCTAssertEqual(v.status, .unknown)
        XCTAssertEqual(v.entries[0].status, .unknown)
        XCTAssertEqual(v.entries[0].kind, .unknown)
        XCTAssertEqual(v.rounds[0].heats[0].status, .unknown)
        let known: TournamentView = try decode(view(status: "active"))
        XCTAssertEqual(known.status, .active)
    }

    /// A flight's entry as the view sends it.
    private func heatEntry(_ id: Int, _ name: String, place: Int? = nil, glass: String? = nil, proof: String = "100") -> String {
        """
        {"entryId":\(id),"name":"\(name)","place":\(place.map(String.init) ?? "null"),"glass":\(glass.map { "\"\($0)\"" } ?? "null"),
         "proof":\(proof),"mashbill":"75% corn, 13% rye, 12% malted barley","ageYears":null,"distilleries":["Buffalo Trace"]}
        """
    }

    private func heat(id: Int, round: Int = 1, slot: Int = 1, status: String, label: String = "null", auto: String = "\"100 proof\"",
                      hidden: Bool = false, entries: [String], glasses: String = "[]", count: Int? = nil) -> String {
        """
        {"id":\(id),"round":\(round),"slot":\(slot),"status":"\(status)","label":\(label),"autoLabel":\(auto),"band":"90 to 94 proof",
         "hidden":\(hidden),"entryCount":\(count ?? entries.count),"glasses":\(glasses),"entries":[\(entries.joined(separator: ","))]}
        """
    }

    private func view(status: String, entries: String = "[]", rounds: String = "[]", plan: String = "[]", current: String = "null",
                      progress: String = "{\"done\":0,\"total\":0}", standings: String = "[]", champion: String = "null", blind: Bool = false) -> String {
        """
        {"id":3,"name":"Spring","status":"\(status)","heatSize":4,"seeding":"similar","groupOrder":["proof","mashbill","distillery","age","finish"],
         "blind":\(blind),"fieldNote":null,"createdAt":"2026-10-01T12:00:00.000Z","startedAt":null,"completedAt":null,
         "entries":\(entries),"rounds":\(rounds),"plan":\(plan),"currentRound":\(current),"progress":\(progress),"standings":\(standings),"champion":\(champion)}
        """
    }

    func testSummaryDecodesWithJSONNumbers() throws {
        let list: TournamentList = try decode("""
        {"tournaments":[
         {"id":3,"name":"Spring","status":"active","heatSize":4,"blind":true,"entryCount":12,"currentRound":2,"totalRounds":3,
          "progress":{"done":1,"total":3},"createdAt":"2026-10-01T12:00:00.000Z","completedAt":null},
         {"id":2,"name":"Old","status":"draft","heatSize":3,"blind":false,"entryCount":0,"currentRound":null,"totalRounds":0,
          "progress":{"done":0,"total":0},"createdAt":"2026-09-01T12:00:00.000Z","completedAt":null}]}
        """)
        XCTAssertEqual(list.tournaments.map(\.id), [3, 2])
        XCTAssertEqual(list.tournaments[0].status, .active)
        XCTAssertEqual(list.tournaments[0].progress, .init(done: 1, total: 3))
        XCTAssertNil(list.tournaments[1].currentRound)
    }

    func testDraftViewWithEntriesAndNoRounds() throws {
        let v: TournamentView = try decode(view(
            status: "draft",
            entries: """
            [{"id":1,"name":"Buffalo Trace","status":"active","kind":"bottle","bottleId":9,"expressionId":4},
             {"id":2,"name":"Elijah Craig","status":"active","kind":"label","bottleId":null,"expressionId":5},
             {"id":3,"name":"Joe's pour","status":"active","kind":"adhoc","bottleId":null,"expressionId":null}]
            """,
            plan: "[1]"))
        XCTAssertEqual(v.status, .draft)
        XCTAssertEqual(v.entries.map(\.kind), [.bottle, .label, .adhoc])
        XCTAssertNil(v.currentRound)
        XCTAssertNil(v.entries[2].bottleId)
        XCTAssertEqual(v.seeding, .similar)
        XCTAssertEqual(v.plan, [1])
    }

    func testRunningOpenViewWithDecidedAndPendingFlights() throws {
        let decided = heat(id: 10, status: "decided", label: "\"MGP 95/5\"",
                           entries: [heatEntry(2, "B", place: 1, glass: "C"), heatEntry(1, "A", place: 2, glass: "A")])
        let pending = heat(id: 11, slot: 2, status: "pending", entries: [heatEntry(3, "C"), heatEntry(4, "D")])
        let v: TournamentView = try decode(view(
            status: "active", rounds: "[{\"round\":1,\"heats\":[\(decided),\(pending)]}]", plan: "[2,1]", current: "1",
            progress: "{\"done\":1,\"total\":2}",
            standings: "[{\"entryId\":2,\"name\":\"B\",\"rank\":1,\"round\":1,\"place\":1}]"))
        let flights = v.rounds[0].heats
        XCTAssertEqual(flights.map(\.status), [.decided, .pending])
        XCTAssertEqual(flights[0].label, "MGP 95/5")
        XCTAssertEqual(flights[0].displayLabel, "MGP 95/5")
        XCTAssertEqual(flights[1].displayLabel, "100 proof")
        XCTAssertEqual(flights[0].entries.map(\.place), [1, 2])
        XCTAssertEqual(flights[0].entries[0].glass, "C")
        XCTAssertEqual(flights[0].entries[0].proof, 100)
        XCTAssertEqual(flights[0].entries[0].distilleries, ["Buffalo Trace"])
        XCTAssertEqual(v.progress, .init(done: 1, total: 2))
        XCTAssertEqual(v.standings.first?.rank, 1)
    }

    func testBlindRunningViewRepresentsAHiddenFlight() throws {
        let hidden = heat(id: 12, status: "pending", auto: "null", hidden: true, entries: [], glasses: "[\"A\",\"B\"]", count: 4)
        let v: TournamentView = try decode(view(status: "active", rounds: "[{\"round\":1,\"heats\":[\(hidden)]}]", current: "1",
                                                progress: "{\"done\":0,\"total\":1}", blind: true))
        let flight = v.rounds[0].heats[0]
        XCTAssertTrue(flight.hidden)
        XCTAssertTrue(flight.entries.isEmpty)
        XCTAssertNil(flight.label)
        XCTAssertNil(flight.autoLabel)
        XCTAssertNil(flight.displayLabel)
        XCTAssertEqual(flight.entryCount, 4)
        XCTAssertEqual(flight.glasses, ["A", "B"])
        XCTAssertEqual(flight.band, "90 to 94 proof")
    }

    func testCompleteViewHasAChampionAndAByeFlight() throws {
        let bye = heat(id: 13, round: 2, slot: 2, status: "bye", entries: [heatEntry(5, "Solo", place: 1)])
        let v: TournamentView = try decode(view(
            status: "complete", rounds: "[{\"round\":2,\"heats\":[\(bye)]}]", current: "2", progress: "{\"done\":1,\"total\":1}",
            standings: "[{\"entryId\":5,\"name\":\"Solo\",\"rank\":1,\"round\":2,\"place\":1}]",
            champion: "{\"entryId\":5,\"name\":\"Solo\"}"))
        XCTAssertEqual(v.status, .complete)
        XCTAssertEqual(v.champion, TournamentChampion(entryId: 5, name: "Solo"))
        XCTAssertEqual(v.rounds[0].heats[0].status, .bye)
        XCTAssertEqual(v.rounds[0].id, 2)
    }

    func testDrawnHeat() throws {
        let drawn: DrawnHeat = try decode("""
        {"heatId":11,"round":1,"slot":2,"band":"90 to 94 proof","glasses":[
         {"glass":"B","entry":{"entryId":3,"name":"C","proof":92.5,"mashbill":null,"ageYears":4,"distilleries":[]}},
         {"glass":"A","entry":{"entryId":4,"name":"D","proof":null,"mashbill":"x","ageYears":null,"distilleries":["MGP"]}}]}
        """)
        XCTAssertEqual(drawn.id, 11)
        XCTAssertEqual(drawn.glasses.map(\.glass), ["B", "A"])
        XCTAssertEqual(drawn.glasses[0].entry.proof, 92.5)
        XCTAssertEqual(drawn.glasses[0].entry.ageYears, 4)
        XCTAssertNil(drawn.glasses[1].entry.proof)
    }

    func testRankingResult() throws {
        let r: RankingResult = try decode("""
        {"competitors":[
          {"id":"b:7","theta":0.82,"rank":1,"heats":4,"provisional":false,"singleBand":false,"group":1,"groupSize":41,
           "name":"Buffalo Trace","bottleId":7,"expressionId":2,"rating":8.5},
          {"id":"e:9","theta":-0.1,"rank":2,"heats":1,"provisional":true,"singleBand":true,"group":2,"groupSize":3,
           "name":"A label","bottleId":null,"expressionId":9,"rating":null}],
         "audit":[{"id":"b:7","name":"Buffalo Trace","rating":8.5,"rank":1,"groupSize":41,"expectedRank":9,"gap":-8}]}
        """)
        XCTAssertEqual(r.competitors.map(\.id), ["b:7", "e:9"])
        XCTAssertTrue(r.competitors[1].provisional)
        XCTAssertNil(r.competitors[1].rating)
        XCTAssertEqual(r.audit[0].gap, -8)
        XCTAssertEqual(r.audit[0].expectedRank, 9)
    }

    func testFieldCandidateAndLabelCandidate() throws {
        let page: FieldPage = try decode("""
        {"rows":[{"bottleId":9,"expressionId":4,"name":"Buffalo Trace","category":"Bourbon","categoryId":2,"proof":90,"status":"open",
                  "isOpen":true,"tastings":2,"avgRating":7.5},
                 {"bottleId":10,"expressionId":5,"name":"Mystery","category":"Rum","categoryId":8,"proof":null,"status":"owned",
                  "isOpen":false,"tastings":0,"avgRating":null}],"total":812}
        """)
        XCTAssertEqual(page.total, 812)
        XCTAssertEqual(page.rows.map(\.id), [9, 10])
        XCTAssertNil(page.rows[1].avgRating)
        let labels: LabelCandidates = try decode("""
        {"rows":[{"expressionId":5,"name":"Elijah Craig Small Batch","category":"Bourbon","proof":94}]}
        """)
        XCTAssertEqual(labels.rows[0].id, 5)
    }

    func testPatchSendsOnlyWhatChangedAndNullForAClearedNote() {
        XCTAssertTrue(TournamentPatch().json.isEmpty)
        var patch = TournamentPatch(name: "X", heatSize: 3, seeding: .random, blind: true, entries: [.bottle(1), .label(2), .outside("Joe")])
        patch.fieldNote = .some(nil)
        let json = patch.json
        XCTAssertEqual(json["name"] as? String, "X")
        XCTAssertEqual(json["seeding"] as? String, "random")
        XCTAssertTrue(json["fieldNote"] is NSNull)
        XCTAssertNil(json["groupOrder"])
        let entries = json["entries"] as? [[String: Any]]
        XCTAssertEqual(entries?.map { NSDictionary(dictionary: $0) }, [["bottleId": 1], ["expressionId": 2], ["name": "Joe"]] as [NSDictionary])
    }

    func testFieldFiltersQuery() {
        XCTAssertTrue(FieldFilters().queryItems.isEmpty)
        var f = FieldFilters(q: " buffalo ", categoryIds: [4, 2], statuses: [], opened: .sealed, tasted: .untasted)
        XCTAssertEqual(f.queryItems.map { "\($0.name)=\($0.value ?? "")" },
                       ["q=buffalo", "categoryIds=2,4", "statuses=all", "opened=sealed", "tasted=untasted"])
        f.statuses = ["owned", "open"]
        XCTAssertEqual(f.queryItems.first { $0.name == "statuses" }?.value, "open,owned")
    }
}
