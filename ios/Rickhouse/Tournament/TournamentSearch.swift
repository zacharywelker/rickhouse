import Foundation

// Mirrors src/lib/tournaments/bracket-search.ts: change both together.

struct Match: Equatable {
    let entryId: Int
    let heatId: Int
    let round: Int
}

enum TournamentSearch {
    /// Lower case with accents removed, so "Pappy" finds "Pàppy" and either case finds either.
    static func fold(_ text: String) -> String {
        let marks: Set<Unicode.GeneralCategory> = [.nonspacingMark, .spacingMark, .enclosingMark]
        var out = String.UnicodeScalarView()
        out.append(contentsOf: text.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !marks.contains($0.properties.generalCategory) })
        return String(out).lowercased()
    }

    /// Where a bottle is, by name: every word of the query must be in the name. Rounds in order, flights in order, so "next"
    /// walks the page top to bottom. A hidden flight never matches, whatever rows it might carry.
    static func matchEntries(_ view: TournamentView, _ query: String) -> [Match] {
        let words = fold(query).split(whereSeparator: \.isWhitespace).map(String.init)
        if words.isEmpty { return [] }
        var out: [Match] = []
        for round in view.rounds {
            for heat in round.heats where !heat.hidden {
                for e in heat.entries {
                    let name = fold(e.name)
                    if words.allSatisfy({ name.contains($0) }) { out.append(Match(entryId: e.entryId, heatId: heat.id, round: round.round)) }
                }
            }
        }
        return out
    }

    /// The match after (1) or before (-1) the current one, wrapping round; nil when there is none.
    static func stepMatch(count: Int, current: Int?, direction: Int) -> Int? {
        if count == 0 { return nil }
        guard let current else { return direction == 1 ? 0 : count - 1 }
        return (current + direction + count) % count
    }
}
