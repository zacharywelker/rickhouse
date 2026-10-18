import Foundation

// Mirrors src/lib/tournaments/summary-text.ts (statusLine, entriesLabel, heatSizeLabel): change both together.
// The row-only pieces (roundLine, metaLine, decidedLine, accessibilityLabel) are the phone's.

enum TournamentSummaryText {
    private static func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

    /// "Draft", "Round 2 of 4 · 3 of 6 flights decided", "Complete" (the champion's name needs the whole tournament).
    static func statusLine(_ s: TournamentSummary) -> String {
        switch s.status {
        case .draft: return "Draft"
        case .complete: return "Complete"
        case .active:
            guard s.currentRound != nil else { return "Running" }
            return "\(roundLine(s)) · \(decidedLine(s))"
        }
    }

    /// "Draft", "Round 2 of 4" (just "Round 3" once withdrawals made the plan shorter than the round), "Complete".
    static func roundLine(_ s: TournamentSummary) -> String {
        switch s.status {
        case .draft: return "Draft"
        case .complete: return "Complete"
        case .active:
            guard let round = s.currentRound else { return "Running" }
            return s.totalRounds >= round ? "Round \(round) of \(s.totalRounds)" : "Round \(round)"
        }
    }

    /// "3 of 6 flights decided".
    static func decidedLine(_ s: TournamentSummary) -> String {
        "\(s.progress.done) of \(plural(s.progress.total, "flight", "flights")) decided"
    }

    static func entriesLabel(_ count: Int) -> String { plural(count, "entry", "entries") }

    static func heatSizeLabel(_ heatSize: Int) -> String { "flights of \(heatSize)" }

    /// The row's second line: "Round 2 of 3 · Blind · 12 entries · flights of 4".
    static func metaLine(_ s: TournamentSummary) -> String {
        ([roundLine(s)] + (s.blind ? ["Blind"] : []) + [entriesLabel(s.entryCount), heatSizeLabel(s.heatSize)]).joined(separator: " · ")
    }

    /// A progress bar is drawn only for a running tournament that has flights.
    static func showsProgress(_ s: TournamentSummary) -> Bool { s.status == .active && s.progress.total > 0 }

    /// One sentence for VoiceOver: "Bourbon, spring. Round 2 of 3, blind, 12 entries, flights of 4, 0 of 2 flights decided".
    static func accessibilityLabel(_ s: TournamentSummary) -> String {
        var parts = [roundLine(s)]
        if s.blind { parts.append("blind") }
        parts += [entriesLabel(s.entryCount), heatSizeLabel(s.heatSize)]
        if showsProgress(s) { parts.append(decidedLine(s)) }
        return "\(s.name). " + parts.joined(separator: ", ")
    }

    /// Only a draft or a finished tournament can be deleted; the server answers 409 to a running one.
    static func canDelete(_ s: TournamentSummary) -> Bool { s.status != .active }
}
