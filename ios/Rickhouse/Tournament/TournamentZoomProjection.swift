import Foundation

// No web twin. What the Compact and Map layouts draw, taken from the bracket model so they cannot show more than it does:
// a hidden flight has no rows there, so no level can show a name from one.

struct CompactRow: Equatable, Identifiable {
    let entryId: Int
    let place: Int?
    let name: String
    let proof: String
    /// In a decided flight: this bottle goes through to the next round.
    var advanced = false

    var id: Int { entryId }
}

struct CompactFlight: Equatable, Identifiable {
    let id: Int
    /// A hidden flight shows only its band here.
    let title: String
    let status: HeatStatus
    let hidden: Bool
    let count: Int
    let rows: [CompactRow]
}

enum TileStatus: Equatable { case pending, decided, bye, hidden }

/// A flight on the map: its label or band, a status, and one marker per bottle. No bottle text.
struct MapTile: Equatable, Identifiable {
    let id: Int
    let text: String
    let status: TileStatus
    let markers: Int
}

enum MapRow: Equatable {
    /// Rounds that are done, collapsed: "Rounds 1 and 2 · 77 flights · decided".
    case finished(summary: String)
    /// The round being played (or, in a draft or a finished tournament, the last one): its flights as tiles.
    case current(heading: String, tiles: [MapTile])
    /// A round still to come, as counts.
    case later(heading: String, count: String, detail: String)
}

enum ZoomProjection {
    /// One line per bottle (place, name, proof) for the flights of `round`; a hidden flight is its band and a count.
    static func compact(_ model: BracketModel, round: Int) -> [CompactFlight] {
        for case .round(let column) in model.columns where column.round == round {
            return column.flights.map { f in
                CompactFlight(id: f.id, title: f.title.text, status: f.status, hidden: f.hidden, count: f.count,
                              rows: f.rows.map { CompactRow(entryId: $0.entryId, place: $0.place, name: $0.name, proof: $0.proof, advanced: $0.advanced) })
            }
        }
        return []
    }

    /// One row per round: finished rounds collapsed into one summary, the focus round as tiles, later rounds as counts.
    static func map(_ model: BracketModel) -> [MapRow] {
        let real = model.columns.compactMap { c -> RoundColumn? in if case .round(let r) = c { r } else { nil } }
        guard let focus = real.first(where: { $0.state == .now }) ?? real.last else { return [] }
        var rows: [MapRow] = []

        let finished = real.filter { $0.round < focus.round }
        if let first = finished.first, let last = finished.last {
            let rounds = finished.count == 1 ? "Round \(first.round)"
                : finished.count == 2 ? "Rounds \(first.round) and \(last.round)" : "Rounds \(first.round) to \(last.round)"
            let flights = finished.reduce(0) { $0 + $1.flights.count }
            rows.append(.finished(summary: "\(rounds) · \(TournamentBracketModel.plural(flights, "flight")) · decided"))
        }

        rows.append(.current(heading: focus.heading, tiles: focus.flights.map { f in
            MapTile(id: f.id, text: f.title.text, status: f.hidden ? .hidden : tileStatus(f.status), markers: f.count)
        }))

        for case .planned(let p) in model.columns where p.round > focus.round {
            rows.append(.later(heading: p.heading, count: p.count, detail: p.title))
        }
        return rows
    }

    private static func tileStatus(_ s: HeatStatus) -> TileStatus {
        switch s {
        case .pending, .unknown: .pending
        case .decided: .decided
        case .bye: .bye
        }
    }
}
