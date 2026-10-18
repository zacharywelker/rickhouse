import Foundation
@testable import Rickhouse

/// Builders for the tournament logic tests, the Swift counterpart of the helpers at the top of the web tests.
enum Fx {
    static let defaultOrder = ["proof", "mashbill", "distillery", "age", "finish"]

    static func entry(_ id: Int, _ name: String, _ proof: Double?, place: Int? = nil, glass: String? = nil,
                      mashbill: String? = nil, age: Double? = nil) -> HeatEntry {
        HeatEntry(entryId: id, name: name, place: place, glass: glass, proof: proof, mashbill: mashbill, ageYears: age, distilleries: [])
    }

    static func heat(_ id: Int, _ round: Int, _ slot: Int, _ entries: [HeatEntry] = [], status: HeatStatus = .pending,
                     label: String? = nil, auto: String? = nil, band: String = "", hidden: Bool = false,
                     count: Int? = nil, glasses: [String] = []) -> TournamentHeat {
        TournamentHeat(id: id, round: round, slot: slot, status: status, label: label, autoLabel: auto, band: band, hidden: hidden,
                       entryCount: count ?? entries.count, glasses: glasses, entries: entries)
    }

    /// Rounds numbered from 1 in the order given.
    static func rounds(_ heats: [[TournamentHeat]]) -> [TournamentRound] {
        heats.enumerated().map { TournamentRound(round: $0.offset + 1, heats: $0.element) }
    }

    static let people: [TournamentEntry] = [
        TournamentEntry(id: 1, name: "A", status: .active, kind: .bottle, bottleId: 1, expressionId: 1),
        TournamentEntry(id: 2, name: "B", status: .withdrawn, kind: .bottle, bottleId: 2, expressionId: 2),
    ]

    static func view(_ status: TournamentStatus, rounds: [TournamentRound], current: Int?? = nil, blind: Bool = false,
                     heatSize: Int = 4, seeding: Seeding = .similar, order: [String]? = nil, entries: [TournamentEntry]? = nil,
                     standings: [TournamentStanding] = [], champion: TournamentChampion? = nil) -> TournamentView {
        TournamentView(id: 1, name: "T", status: status, heatSize: heatSize, seeding: seeding, groupOrder: order ?? defaultOrder,
                       blind: blind, fieldNote: nil, createdAt: "", startedAt: nil, completedAt: nil, entries: entries ?? people,
                       rounds: rounds, plan: [], currentRound: current ?? (rounds.isEmpty ? nil : rounds.count), progress: .init(done: 0, total: 0),
                       standings: standings, champion: champion)
    }

    /// A view from nested heats, rounds 1...n, current round the last one (the web tests' `view(status, rounds)`).
    static func view(_ status: TournamentStatus, _ heats: [[TournamentHeat]], blind: Bool = false) -> TournamentView {
        view(status, rounds: rounds(heats), blind: blind)
    }
}

/// A generator that answers from a list, then repeats the last answer; 0 always gives the first choice.
struct ScriptedGenerator: RandomNumberGenerator {
    var values: [UInt64]
    mutating func next() -> UInt64 { values.count > 1 ? values.removeFirst() : (values.first ?? 0) }
}
