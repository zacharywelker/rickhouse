import Foundation

// Mirrors src/lib/tournaments/standings-model.ts: change both together.

struct StandingRow: Equatable, Identifiable {
    let entryId: Int
    /// "1", or "2=" when it shares the place with another.
    let place: String
    let name: String
    /// "Champion", "Out in round 2", or "Out in the final" for second place on.
    let left: String
    let champion: Bool

    var id: Int { entryId }
}

enum TournamentStandings {
    /// Display rows from the view's standings: the engine's ranks (1, 2, 2, 4) shown as places, a shared one marked "2=".
    /// Empty until a flight has been decided. The champion is only called one once the tournament is finished.
    static func rows(_ view: TournamentView) -> [StandingRow] {
        var shared: [Int: Int] = [:]
        for s in view.standings { shared[s.rank, default: 0] += 1 }
        let finalRound = view.rounds.last?.round
        return view.standings.map { s in
            let champion = view.champion?.entryId == s.entryId
            let left: String
            // While it runs, a bottle that advanced has not left: say only where it last poured.
            if view.status != .complete { left = "Last flight: round \(s.round)" }
            else if champion { left = "Champion" }
            else if s.round == finalRound && view.champion != nil { left = "Out in the final" }
            else { left = "Out in round \(s.round)" }
            return StandingRow(entryId: s.entryId, place: (shared[s.rank] ?? 1) > 1 ? "\(s.rank)=" : String(s.rank),
                               name: s.name, left: left, champion: champion)
        }
    }
}
