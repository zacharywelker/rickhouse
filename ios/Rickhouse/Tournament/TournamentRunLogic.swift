import Foundation

// The running and finished tournament's decisions, kept out of the views so they can be tested.
// The bar and the words mirror run-bar.tsx and withdraw-button.tsx; Find a bottle mirrors bracket.tsx / bracket-find.tsx.

/// What the bar under a running tournament offers.
struct RunBarOffer: Equatable {
    let draw: Bool
    let reset: Bool
}

/// The entries to mark on the round on screen.
struct FindHighlight: Equatable {
    var entryIds: Set<Int> = []
    var currentEntryId: Int?
}

/// The Find a bottle box: the words typed and which match "Next" is on. The matches themselves come from `TournamentSearch`.
struct FindState: Equatable {
    private(set) var query = ""
    private(set) var index: Int?

    var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    mutating func setQuery(_ q: String) {
        query = q
        index = nil
    }

    func matches(_ view: TournamentView) -> [Match] { TournamentSearch.matchEntries(view, query) }

    /// Moves to the next (1) or previous (-1) match, wrapping round, and answers where it landed.
    @discardableResult
    mutating func step(_ direction: Int, count: Int) -> Int? {
        index = TournamentSearch.stepMatch(count: count, current: index.flatMap { $0 < count ? $0 : nil }, direction: direction)
        return index
    }

    /// The match "Next" is on; nil before the first step, or when a reload left fewer matches than that.
    func current(in matches: [Match]) -> Match? {
        guard let index, index < matches.count else { return nil }
        return matches[index]
    }

    func currentRound(in matches: [Match]) -> Int? { current(in: matches)?.round }

    /// The marks for one round: every match in it, and the current one if it is there.
    func highlight(_ matches: [Match], round: Int) -> FindHighlight {
        let here = matches.filter { $0.round == round }
        let now = current(in: matches)
        return FindHighlight(entryIds: Set(here.map(\.entryId)), currentEntryId: now?.round == round ? now?.entryId : nil)
    }

    func status(count: Int) -> String {
        if !searching { return "" }
        if count == 0 { return "No bottle matches." }
        if index == nil || index! >= count { return "\(count) \(count == 1 ? "match" : "matches")" }
        return "Match \(index! + 1) of \(count)"
    }
}

enum TournamentRunLogic {
    static let resetNote = "Regroups the flights not yet decided and clears their names. Decided flights stay."
    static let withdrawMessage = "It leaves its flight; results already recorded stay."

    /// Draw a flight (blind, something left to taste) and Reset to automatic (something undecided); nil when neither,
    /// and always nil for a draft (its own bar) or a finished tournament.
    static func bar(_ view: TournamentView) -> RunBarOffer? {
        guard view.status == .active else { return nil }
        let offer = RunBarOffer(draw: FlightActions.canDraw(view), reset: FlightActions.canReset(view))
        return offer.draw || offer.reset ? offer : nil
    }

    /// One line for a running blind tournament; the status line above it already says how far it has got.
    static func blindLine(_ view: TournamentView) -> String? {
        view.status == .active && view.blind ? "Blind: names stay hidden until a flight is decided." : nil
    }

    static func standingsTitle(_ view: TournamentView) -> String { view.status == .complete ? "Final standings" : "Standings so far" }

    static func withdrawTitle(_ name: String) -> String { "Withdraw \(name)?" }
}
