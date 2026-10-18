import Foundation

// Mirrors src/lib/tournaments/bracket-actions.ts: change both together.
// Swift shape: the functions take the whole `TournamentView` where the web takes a `Pick` of it.

/// Everything one flight offers, worked out here so the screen only draws what is allowed.
struct FlightControls: Equatable {
    let play: Bool
    let undo: Bool
    let move: Bool
    let withdraw: [Int]
}

enum FlightActions {
    private static func isCurrent(_ view: TournamentView, _ heat: TournamentHeat) -> Bool {
        view.currentRound != nil && heat.round == view.currentRound
    }

    /// Play: a pending flight of the current round of a running tournament.
    static func canPlay(_ view: TournamentView, _ heat: TournamentHeat) -> Bool {
        view.status == .active && heat.status == .pending && isCurrent(view, heat)
    }

    /// Undo: a decided flight, while no flight of a later round has a result (the server's rule in `undoHeat`).
    static func canUndo(_ view: TournamentView, _ heat: TournamentHeat) -> Bool {
        if view.status == .draft || heat.status != .decided { return false }
        return !view.rounds.contains { $0.round > heat.round && $0.heats.contains { $0.status == .decided } }
    }

    /// Withdraw: an active entry of a running tournament, in a flight of the current round that is not decided.
    /// A hidden flight has no rows to ask it of.
    static func canWithdraw(_ view: TournamentView, _ heat: TournamentHeat, entryId: Int) -> Bool {
        if view.status != .active || heat.hidden || heat.status == .decided || !isCurrent(view, heat) { return false }
        return view.entries.contains { $0.id == entryId && $0.status == .active }
    }

    /// A flight whose bottles can still be moved: a bye is a flight of one that the server lets bottles leave and join.
    static func isOpen(_ heat: TournamentHeat) -> Bool { heat.status == .pending || heat.status == .bye }

    /// Move and swap: a draft's flights, or a running open tournament's undecided flights of the current round. Never a blind one.
    static func canMove(_ view: TournamentView, _ heat: TournamentHeat) -> Bool {
        if heat.hidden || !isOpen(heat) { return false }
        if view.status == .draft { return true }
        return view.status == .active && !view.blind && isCurrent(view, heat)
    }

    /// Reset to automatic: regroup the undecided flights; a draft needs two entries, a running one something undecided; never when finished.
    static func canReset(_ view: TournamentView) -> Bool {
        switch view.status {
        case .complete: return false
        case .draft: return view.entries.filter { $0.status == .active }.count >= 2
        case .active:
            guard let current = view.rounds.first(where: { $0.round == view.currentRound }) else { return false }
            return current.heats.contains { $0.status != .decided }
        }
    }

    static func flightControls(_ view: TournamentView, _ heat: TournamentHeat) -> FlightControls {
        FlightControls(
            play: canPlay(view, heat), undo: canUndo(view, heat), move: canMove(view, heat),
            withdraw: heat.entries.filter { canWithdraw(view, heat, entryId: $0.entryId) }.map(\.entryId))
    }

    /// Draw a flight: a running blind tournament with a flight still to taste in the current round (the pourer's start).
    static func canDraw(_ view: TournamentView) -> Bool {
        if view.status != .active || !view.blind { return false }
        return view.rounds.contains { $0.round == view.currentRound && $0.heats.contains { $0.status == .pending } }
    }

    /// The next pending flight of the current round after this one (by slot), else any other pending one, else nil.
    static func nextPendingId(_ view: TournamentView, heatId: Int) -> Int? {
        let pending = view.rounds.filter { $0.round == view.currentRound }.flatMap(\.heats).filter { $0.status == .pending && $0.id != heatId }
        let here = view.rounds.flatMap(\.heats).first { $0.id == heatId }
        let after = here.flatMap { h in h.round == view.currentRound ? pending.first { $0.slot > h.slot } : nil }
        return (after ?? pending.first)?.id
    }
}
