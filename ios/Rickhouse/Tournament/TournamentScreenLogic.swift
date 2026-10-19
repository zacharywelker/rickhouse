import Foundation

// The tournament screen's decisions, kept out of the views so they can be tested. The move and swap lists mirror
// bracket.tsx (`others`, `moveTargets`, `swapTargets`); the rest is the phone's.

/// One stop of the round selector: a real round, or one still to come (shown as counts).
struct RoundOption: Equatable, Identifiable {
    let round: Int
    /// "Round 2", or "Final".
    let heading: String
    let count: String
    let planned: Bool
    var id: Int { round }
}

/// Where a bottle can be moved to: another flight of the round that is not decided. A full one is listed but off.
struct MoveTarget: Equatable, Identifiable {
    let heatId: Int
    let title: String
    let full: Bool
    var id: Int { heatId }
}

/// A bottle in another flight that a bottle can trade places with.
struct SwapTarget: Equatable, Identifiable {
    let entryId: Int
    let name: String
    let flight: String
    var id: Int { entryId }
}

/// The settings sheet's working copy. `patch` is only what changed; nil when nothing did.
struct SettingsDraft: Equatable {
    static let maxName = TournamentLimits.name
    static let maxNote = TournamentLimits.note

    var name: String
    var heatSize: Int
    var blind: Bool
    var seeding: Seeding
    var groupOrder: [String]
    var note: String

    init(_ view: TournamentView) {
        name = view.name
        heatSize = view.heatSize
        blind = view.blind
        seeding = view.seeding
        groupOrder = view.groupOrder
        note = view.fieldNote ?? ""
    }

    var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    var trimmedNote: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }
    var isValid: Bool { !trimmedName.isEmpty }

    func patch(against view: TournamentView) -> TournamentPatch? {
        var p = TournamentPatch()
        if trimmedName != view.name { p.name = trimmedName }
        if heatSize != view.heatSize { p.heatSize = heatSize }
        if blind != view.blind { p.blind = blind }
        if seeding != view.seeding { p.seeding = seeding }
        if groupOrder != view.groupOrder { p.groupOrder = groupOrder }
        if trimmedNote != (view.fieldNote ?? "") { p.fieldNote = .some(trimmedNote.isEmpty ? nil : trimmedNote) }
        return p == TournamentPatch() ? nil : p
    }

    /// A running tournament takes only seeding and the grouping order (the server refuses the rest).
    func groupingPatch(against view: TournamentView) -> TournamentPatch? {
        var p = TournamentPatch()
        if seeding != view.seeding { p.seeding = seeding }
        if groupOrder != view.groupOrder { p.groupOrder = groupOrder }
        return p == TournamentPatch() ? nil : p
    }

    /// Flight size, seeding and the grouping order make the server regroup the flights (and drop the names you gave them);
    /// the name, blind and the note do not.
    func regroups(against view: TournamentView) -> Bool {
        heatSize != view.heatSize || seeding != view.seeding || groupOrder != view.groupOrder
    }
}

enum TournamentScreenLogic {
    static let regroupNote = "Changing flight size, seeding or the grouping order regroups the flights and clears names you gave them."

    static func activeCount(_ view: TournamentView) -> Int { view.entries.filter { $0.status == .active }.count }

    // MARK: Header

    /// "Draft · 12 bottles · flights of 4"; "Running · 18 bottles · flights of 3 · random seeding".
    static func headerMeta(_ view: TournamentView) -> String {
        let status = view.status == .draft ? "Draft" : view.status == .active ? "Running" : "Finished"
        return [status, TournamentBracketModel.bottlesText(activeCount(view)), TournamentSummaryText.heatSizeLabel(view.heatSize)]
            .joined(separator: " · ") + (view.seeding == .random ? " · random seeding" : "")
    }

    /// "Round 2 of 3 · 1 of 2 flights decided" while it runs; nil for a draft or a finished one.
    static func statusLine(_ view: TournamentView) -> String? {
        guard view.status == .active else { return nil }
        return TournamentSummaryText.statusLine(summary(view))
    }

    private static func summary(_ v: TournamentView) -> TournamentSummary {
        TournamentSummary(id: v.id, name: v.name, status: v.status, heatSize: v.heatSize, blind: v.blind, entryCount: activeCount(v),
                          currentRound: v.currentRound, totalRounds: v.plan.count, progress: v.progress, createdAt: v.createdAt, completedAt: v.completedAt)
    }

    // MARK: Rounds

    /// A stop per column of the bracket: the real rounds, then the ones still to come.
    static func roundOptions(_ model: BracketModel) -> [RoundOption] {
        model.columns.map {
            switch $0 {
            case .round(let c): RoundOption(round: c.round, heading: c.heading, count: c.count, planned: false)
            case .planned(let c): RoundOption(round: c.round, heading: c.heading, count: c.count, planned: true)
            }
        }
    }

    /// The round shown: the one you picked if it still exists, else the round being played (a draft's first, a finished one's final).
    static func effectiveRound(_ view: TournamentView, options: [RoundOption], chosen: Int?) -> Int? {
        if let chosen, options.contains(where: { $0.round == chosen }) { return chosen }
        if let current = view.currentRound, options.contains(where: { $0.round == current }) { return current }
        return options.first?.round
    }

    // MARK: Draft bar

    static func canStart(_ view: TournamentView) -> Bool { view.status == .draft && activeCount(view) >= 2 }

    /// The line under the draft bar's buttons: why Start is off, or how many flights you named.
    static func barNote(_ view: TournamentView, renamed: Int) -> String? {
        if activeCount(view) < 2 { return "Starting needs at least 2 entries." }
        return renamed > 0 ? "\(TournamentBracketModel.plural(renamed, "flight")) renamed." : nil
    }

    /// The one line of the running Grouping sheet.
    static let groupingNote = "Applies to the next round, or to this one right away with Reset to automatic."

    static let fewEntries = "Add at least 2 bottles to start."

    /// In the settings sheet: what saving would do to names you gave flights; nil when nothing is lost.
    static func regroupWarning(_ draft: SettingsDraft, view: TournamentView, renamed: Int) -> String? {
        guard renamed > 0, draft.regroups(against: view) else { return nil }
        return "Saving regroups the flights and clears \(renamed == 1 ? "the flight name" : "the \(renamed) flight names") you gave."
    }

    /// The patch that makes the draft's entries the edited field; nil when the field is unchanged.
    static func fieldPatch(original: [TournamentEntry], edited: FieldState) -> TournamentPatch? {
        let before = TournamentFieldSelection.toEntryInputs(TournamentFieldSelection.fieldFromEntries(original).entries)
        let after = TournamentFieldSelection.toEntryInputs(edited.entries)
        return before == after ? nil : TournamentPatch(entries: after)
    }

    // MARK: Move and swap

    /// The other flights of the round whose bottles can still change: not hidden, not decided (a bye counts).
    private static func others(_ column: RoundColumn, than flight: FlightModel) -> [FlightModel] {
        column.flights.filter { $0.id != flight.id && !$0.hidden && ($0.status == .pending || $0.status == .bye) }
    }

    static func moveTargets(_ column: RoundColumn, from flight: FlightModel, heatSize: Int) -> [MoveTarget] {
        others(column, than: flight).map { MoveTarget(heatId: $0.id, title: "Flight \($0.number) · \($0.title.text)", full: $0.count >= heatSize) }
    }

    static func swapTargets(_ column: RoundColumn, from flight: FlightModel) -> [SwapTarget] {
        others(column, than: flight).flatMap { other in other.rows.map { SwapTarget(entryId: $0.entryId, name: $0.name, flight: "Flight \(other.number)") } }
    }

    /// A swap list narrowed by a typed query: every word must be in the bottle's name, accents and case ignored.
    static func filterSwaps(_ swaps: [SwapTarget], query: String) -> [SwapTarget] {
        let words = TournamentSearch.fold(query).split(whereSeparator: \.isWhitespace).map(String.init)
        if words.isEmpty { return swaps }
        return swaps.filter { s in let name = TournamentSearch.fold(s.name); return words.allSatisfy { name.contains($0) } }
    }

    // MARK: Renaming

    static let maxFlightName = TournamentLimits.flightName

    /// What the rename box saves: nothing typed (or only spaces) clears your name; a long one is cut at 80.
    static func flightLabel(from text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : TournamentLimits.clamp(t, to: maxFlightName)
    }

    // MARK: Words for the Map

    static func tileStatusText(_ s: TileStatus, draft: Bool) -> String {
        switch s {
        case .pending: draft ? "Not started" : "To taste"
        case .decided: "Decided"
        case .bye: "Bye"
        case .hidden: "To taste"
        }
    }
}
