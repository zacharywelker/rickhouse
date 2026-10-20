import Foundation

// Mirrors src/lib/tournaments/bracket-model.ts: change both together.
// Swift shape: the builder takes the whole `TournamentView` (the web takes a `Pick` of it), and a hidden flight's rows
// are always dropped here even if the server were to send some (the web trusts the server).

struct FlightTitle: Equatable {
    let text: String
    let yours: Bool
}

struct RowModel: Equatable, Identifiable {
    let entryId: Int
    let name: String
    let proof: String
    let mashbill: String
    let age: String
    /// The spirit category ("Bourbon"); nil for an outside entry or when unknown.
    let category: String?
    let distilleries: [String]
    let finishes: [String]
    /// True when no proof is recorded, so the grouping put the bottle last.
    let unknownProof: Bool
    let place: Int?
    /// In a decided flight: this bottle goes through to the next round.
    let advanced: Bool
    let glass: String?

    var id: Int { entryId }
}

struct FlightModel: Equatable, Identifiable {
    let id: Int
    /// Its position in the round, from 1; slots can have gaps after a flight is emptied.
    let number: Int
    let status: HeatStatus
    let title: FlightTitle
    /// The line under the title: "Flight 2 · 90 to 100 proof".
    let meta: String
    let hidden: Bool
    /// How many bottles it holds, also for a hidden flight.
    let count: Int
    /// For a hidden flight: how many glasses have a letter so far.
    let glassesSet: Int
    let rows: [RowModel]
}

enum RoundState: Equatable { case decided, now }

struct RoundColumn: Equatable {
    let round: Int
    /// "Round 1", or "Final" when the round is one flight.
    let heading: String
    /// `.decided` or `.now` once the tournament runs; nil while it is a preview.
    let state: RoundState?
    let count: String
    let note: String
    let flights: [FlightModel]
}

struct PlannedColumn: Equatable {
    let round: Int
    let heading: String
    let count: String
    let note: String
    let title: String
    let fill: String
}

enum BracketColumn: Equatable {
    case round(RoundColumn)
    case planned(PlannedColumn)

    var heading: String {
        switch self {
        case .round(let c): c.heading
        case .planned(let c): c.heading
        }
    }
}

struct BracketModel: Equatable {
    let columns: [BracketColumn]
    /// Bottles in the first round that have no proof, for the preview note.
    let unknownProof: Int
    /// Flights you named yourself, in the rounds shown.
    let renamed: Int
}

enum TournamentBracketModel {
    static func plural(_ n: Int, _ one: String, _ many: String? = nil) -> String { "\(n) \(n == 1 ? one : (many ?? one + "s"))" }
    static func bottlesText(_ n: Int) -> String { plural(n, "bottle") }

    private static func number(_ d: Double) -> String { d == d.rounded() ? String(Int(d)) : String(d) }
    static func formatProof(_ proof: Double?) -> String { proof.map(number) ?? "—" }
    static func formatAge(_ years: Double?) -> String {
        years.map { "\(number(($0 * 10).rounded() / 10)) yr" } ?? "—"
    }

    /// Lowest to highest proof for the pour, unknown proof last; ties by name, then id, so the order is stable.
    static func pourOrder(_ entries: [HeatEntry]) -> [HeatEntry] {
        entries.sorted {
            let (a, b) = ($0.proof ?? .infinity, $1.proof ?? .infinity)
            if a != b { return a < b }
            let byName = $0.name.compare($1.name, locale: Locale(identifier: "en"))
            return byName != .orderedSame ? byName == .orderedAscending : $0.entryId < $1.entryId
        }
    }

    /// A flight's title: your own name wins and is marked yours; else what its bottles share (the server's generated name,
    /// never the proof band, which the meta line carries); else its number. A hidden flight (pending in a running blind
    /// tournament) shows only its band: even a name you gave it could give the glass away.
    static func flightTitle(_ heat: TournamentHeat, number: Int) -> FlightTitle {
        if heat.hidden { return FlightTitle(text: heat.band.isEmpty ? "Flight \(number)" : heat.band, yours: false) }
        if let custom = heat.label?.trimmingCharacters(in: .whitespacesAndNewlines), !custom.isEmpty {
            return FlightTitle(text: custom, yours: true)
        }
        return FlightTitle(text: heat.autoLabel ?? "Flight \(number)", yours: false)
    }

    private static func flightModel(_ heat: TournamentHeat, number: Int, final: Bool, draft: Bool) -> FlightModel {
        let title = flightTitle(heat, number: number)
        let entries = heat.hidden ? [] : heat.entries
        var meta: [String] = []
        if title.text != "Flight \(number)" { meta.append("Flight \(number)") }
        if !heat.band.isEmpty && title.text != heat.band { meta.append(heat.band) }
        if !heat.hidden && heat.band.isEmpty && !entries.isEmpty { meta.append("Proof unknown for some") }
        if heat.status == .bye { meta.append("Bye") }

        // Nobody advances out of a final; the champion line shows who won. A draft decides nothing, so a lone bottle (a bye)
        // has not advanced yet.
        let finished = heat.status != .pending && !final && !draft
        let through = Set(finished ? TournamentRounds.advancers(entries.map { Placing(entryId: $0.entryId, place: $0.place) }, bye: heat.status == .bye) : [])
        let ordered = heat.status == .decided ? entries : pourOrder(entries)
        return FlightModel(
            id: heat.id, number: number, status: heat.status, title: title, meta: meta.joined(separator: " · "),
            hidden: heat.hidden, count: heat.entryCount, glassesSet: heat.glasses.count,
            rows: ordered.map {
                RowModel(entryId: $0.entryId, name: $0.name, proof: formatProof($0.proof), mashbill: $0.mashbill ?? "—",
                         age: formatAge($0.ageYears), category: $0.category, distilleries: $0.distilleries, finishes: $0.finishes,
                         unknownProof: $0.proof == nil, place: $0.place,
                         advanced: through.contains($0.entryId), glass: $0.glass)
            })
    }

    /// "Top 2 of each flight advance"; with short flights in the mix, "Flights of 4 advance 2, flights of 3 advance 1".
    static func advanceNote(_ sizes: [Int], past: Bool) -> String {
        let verb = past ? "advanced" : "advance"
        let bySize = Array(Set(sizes)).sorted(by: >)
        if Set(bySize.map(TournamentRounds.advanceCount)).count <= 1 {
            return "Top \(TournamentRounds.advanceCount(bySize.first ?? 1)) of each flight \(verb)"
        }
        let parts = bySize.map { "\($0 == 1 ? "byes" : "flights of \($0)") \(verb) \(TournamentRounds.advanceCount($0))" }.joined(separator: ", ")
        return parts.prefix(1).uppercased() + parts.dropFirst()
    }

    /// The rounds after the last real one, as bottle and flight counts: each round's advancers are cut into flights of `heatSize`.
    static func plannedRounds(lastSizes: [Int], heatSize: Int) -> [(bottles: Int, flights: Int)] {
        var out: [(bottles: Int, flights: Int)] = []
        if lastSizes.count <= 1 || heatSize < 2 { return out }
        var pool = lastSizes.reduce(0) { $0 + TournamentRounds.advanceCount($1) }
        while pool >= 2 {
            out.append((pool, (pool + heatSize - 1) / heatSize))
            if pool <= heatSize { break }
            var next = 0
            var left = pool
            while left > 0 { next += TournamentRounds.advanceCount(min(heatSize, left)); left -= heatSize }
            pool = next
        }
        return out
    }

    /// Turns a tournament into what the bracket draws: a column per round (real flights, then the rounds still to come as counts).
    static func build(_ view: TournamentView) -> BracketModel {
        var columns: [BracketColumn] = []
        var renamed = 0
        for (round, heats) in view.rounds.map({ ($0.round, $0.heats) }) {
            let final = heats.count == 1
            let flights = heats.enumerated().map { flightModel($0.element, number: $0.offset + 1, final: final, draft: view.status == .draft) }
            renamed += heats.filter { !($0.label?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) }.count
            let allDone = heats.allSatisfy { $0.status != .pending }
            let state: RoundState? = view.status == .draft ? nil : allDone ? .decided : round == view.currentRound ? .now : nil
            columns.append(.round(RoundColumn(
                round: round, heading: final ? "Final" : "Round \(round)", state: state,
                count: bottlesText(heats.reduce(0) { $0 + $1.entryCount }),
                note: final ? "Place 1 is the champion" : advanceNote(heats.map(\.entryCount), past: allDone),
                flights: flights)))
        }

        if let last = view.rounds.last {
            let regroup = view.seeding == .random ? "Reshuffled"
                : "Regrouped by \((TournamentPriority.labels[view.groupOrder.first ?? "proof"] ?? "Proof").lowercased())"
            let later = plannedRounds(lastSizes: last.heats.map(\.entryCount), heatSize: view.heatSize)
            var before = columns[columns.count - 1].heading
            for (i, p) in later.enumerated() {
                let final = i == later.count - 1
                let heading = final ? "Final" : "Round \(last.round + 1 + i)"
                columns.append(.planned(PlannedColumn(
                    round: last.round + 1 + i, heading: heading, count: bottlesText(p.bottles),
                    note: final ? "Place 1 is the champion" : "\(regroup) once \(before.lowercased()) is decided",
                    title: final ? "Final flight" : plural(p.flights, "flight"), fill: "Fills after \(before.lowercased())")))
                before = heading
            }
        }

        var unknownProof = 0
        if case .round(let first)? = columns.first { unknownProof = first.flights.reduce(0) { $0 + $1.rows.filter(\.unknownProof).count } }
        return BracketModel(columns: columns, unknownProof: unknownProof, renamed: renamed)
    }
}
