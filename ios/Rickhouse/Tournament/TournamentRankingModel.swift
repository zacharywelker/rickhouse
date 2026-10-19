import Foundation

// Mirrors src/lib/tournaments/ranking-model.ts: change both together. `parseRankingParams` (a URL query) stays on the web.

struct RankingRow: Equatable, Identifiable {
    let id: String
    let rankText: String
    let name: String
    let heats: Int
    let tags: [String]
    /// The average 0 to 10 tasting rating, one decimal, or nil.
    let rating: String?
    /// The competitor's label (for its page), or nil. The web carries a path; the phone navigates by id.
    let expressionId: Int?
}

struct RankingSection: Equatable {
    /// nil when everyone is comparable (the usual case); otherwise "Group 1 of 2".
    let title: String?
    let size: Int
    let note: String?
    let rows: [RankingRow]
}

struct AuditLine: Equatable, Identifiable {
    enum Direction: Equatable { case higher, lower }

    let id: String
    let name: String
    /// "Rated 9.0, ranks 14th of 40".
    let text: String
    let direction: Direction
    let verdict: String
    /// How many places the ranking and the rating disagree by.
    let gap: Int
}

enum RankingEmpty: Equatable { case noFlights, noRatings, noGaps }

enum TournamentRankingModel {
    /// Flights before a ranking stops being provisional (`FIRM_HEATS` in ranking.ts).
    static let firmHeats = 3

    /// 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st.
    static func ordinal(_ n: Int) -> String {
        let teen = n % 100 >= 11 && n % 100 <= 13
        let suffix = teen ? "th" : [1: "st", 2: "nd", 3: "rd"][n % 10] ?? "th"
        return "\(n)\(suffix)"
    }

    private static func rating(_ n: Double) -> String { String(format: "%.1f", n) }

    /// Display sections of the ranking. Strengths are comparable only inside a group of competitors linked by shared flights,
    /// so each group is its own section and ranks never run across them. The strength itself is not shown.
    static func rankingSections(_ result: RankingResult) -> [RankingSection] {
        let groups = Array(Set(result.competitors.map(\.group))).sorted()
        return groups.map { group in
            let members = result.competitors.filter { $0.group == group }
            var shared: [Int: Int] = [:]
            for m in members { shared[m.rank, default: 0] += 1 }
            return RankingSection(
                title: groups.count > 1 ? "Group \(groups.firstIndex(of: group)! + 1) of \(groups.count)" : nil,
                size: members.count,
                note: groups.count > 1 ? "Not comparable with the other groups: these bottles never shared a flight with them." : nil,
                rows: members.map { m in
                    RankingRow(id: m.id, rankText: ordinal(m.rank) + ((shared[m.rank] ?? 1) > 1 ? "=" : ""), name: m.name, heats: m.heats,
                               tags: (m.provisional ? ["Provisional"] : []) + (m.singleBand ? ["Single band"] : []),
                               rating: m.rating.map(rating), expressionId: m.expressionId)
                })
        }
    }

    /// One line per disagreement, biggest first (the engine's order). A rank that matches its rating is not a disagreement.
    static func auditLines(_ result: RankingResult) -> [AuditLine] {
        result.audit.filter { $0.gap != 0 }.map { row in
            // Positive gap: the ranking puts it lower than its rating alone would.
            let direction: AuditLine.Direction = row.gap > 0 ? .lower : .higher
            let word = direction == .lower ? "lower" : "higher"
            return AuditLine(id: row.id, name: row.name, text: "Rated \(rating(row.rating)), ranks \(ordinal(row.rank)) of \(row.groupSize)",
                             direction: direction, verdict: "Ranks \(word) than your rating suggests", gap: abs(row.gap))
        }
    }

    private static func plural(_ n: Int, _ one: String, _ many: String) -> String { n == 1 ? one : many }

    /// What the audit leaves out and why, or nil when nothing is left out.
    static func auditNote(_ result: RankingResult) -> String? {
        let c = result.competitors
        let provisional = c.filter { $0.provisional && $0.rating != nil }.count
        let single = c.filter { !$0.provisional && $0.singleBand && $0.rating != nil }.count
        let unrated = c.filter { $0.rating == nil }.count
        let parts = [
            provisional > 0 ? "\(provisional) \(plural(provisional, "is", "are")) provisional (fewer than \(firmHeats) flights)" : nil,
            single > 0 ? "\(single) only met one proof band" : nil,
            unrated > 0 ? "\(unrated) \(plural(unrated, "has", "have")) no rating" : nil,
        ].compactMap { $0 }
        if parts.isEmpty { return nil }
        let last = parts.count > 1 ? "\(parts.dropLast().joined(separator: ", ")), and \(parts[parts.count - 1])" : parts[0]
        return "\(last), so \(parts.count == 1 && provisional + single + unrated == 1 ? "it is" : "they are") not audited."
    }

    /// Why a view has nothing to show, or nil when it has something. Ranking only needs `noFlights`.
    static func rankingEmpty(_ result: RankingResult) -> RankingEmpty? {
        if result.competitors.isEmpty { return .noFlights }
        if result.competitors.allSatisfy({ $0.rating == nil }) { return .noRatings }
        if auditLines(result).isEmpty { return .noGaps }
        return nil
    }
}
