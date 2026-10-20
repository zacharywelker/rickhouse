import Foundation

// Mirrors the page logic of src/app/(app)/tournaments/[id]/play/[heatId]/page.tsx and play-flight.tsx: change both together.

/// A bottle in an open tournament's ranking list: its name and one line of facts.
struct PlayEntry: Equatable, Identifiable {
    let entryId: Int
    let name: String
    let detail: String
    var id: Int { entryId }
}

/// A finished flight, as the reveal shows it.
struct PlayDecided: Equatable {
    struct Place: Equatable { let place: Int; let name: String }
    let places: [Place]
    let champion: String?
    let nextHeatId: Int?
}

enum PlayStopped: Equatable {
    case decided, notRunning, notCurrent

    var text: String {
        switch self {
        case .decided: "This flight is already decided."
        case .notRunning: "This tournament is not running."
        case .notCurrent: "This flight is not in the round being played."
        }
    }
}

enum TournamentPlayLogic {
    /// Why the flight cannot be played, or nil when it can (a pending flight of the current round of a running tournament).
    static func stopped(_ view: TournamentView, _ heat: TournamentHeat) -> PlayStopped? {
        if view.status == .active && heat.status == .pending && heat.round == view.currentRound { return nil }
        if heat.status != .pending { return .decided }
        return view.status == .active ? .notCurrent : .notRunning
    }

    /// "90 proof · 60% corn · 4 yr"; a fact that is not known is left out, as the bracket's rows do (no proof says so).
    static func detail(proof: String, mashbill: String, age: String) -> String {
        let known = [mashbill, age].filter { $0 != "—" }
        return ([proof == "—" ? "Proof unknown" : "\(proof) proof"] + known).joined(separator: " · ")
    }

    static func detail(_ proof: Double?, _ mashbill: String?, _ ageYears: Double?) -> String {
        detail(proof: TournamentBracketModel.formatProof(proof), mashbill: mashbill ?? "—", age: TournamentBracketModel.formatAge(ageYears))
    }

    /// An open tournament's bottles, lowest proof first (the order they are poured).
    static func entries(_ flight: FlightModel) -> [PlayEntry] {
        flight.rows.map { PlayEntry(entryId: $0.entryId, name: $0.name, detail: detail(proof: $0.proof, mashbill: $0.mashbill, age: $0.age)) }
    }

    static func mappingRows(_ drawn: DrawnHeat) -> [MappingRow] {
        drawn.glasses.map { MappingRow(entryId: $0.entry.entryId, name: $0.entry.name, proof: $0.entry.proof, mashbill: $0.entry.mashbill,
                                       ageYears: $0.entry.ageYears, glass: $0.glass) }
    }

    static func decided(_ view: TournamentView, heatId: Int) -> PlayDecided? {
        guard let heat = view.rounds.flatMap(\.heats).first(where: { $0.id == heatId }), heat.status == .decided else { return nil }
        let places = heat.entries.compactMap { e in e.place.map { PlayDecided.Place(place: $0, name: e.name) } }.sorted { $0.place < $1.place }
        return PlayDecided(places: places, champion: view.champion?.name, nextHeatId: FlightActions.nextPendingId(view, heatId: heatId))
    }

    /// The server's refusal when a result is already there (a second tap, or another device): the page shows the result.
    static func isAlreadyDecided(_ message: String) -> Bool { message.range(of: "already has a result", options: .caseInsensitive) != nil }

    static func rankHint(blind: Bool) -> String { blind ? "Best first. No ties. Glass letters only: the names stay hidden until you lock in." : "Best first. No ties." }

    static let startSentence = "Set the glasses, then hide the names and taste. The names stay hidden until you record the result."
    static let mappingSentence = "Pourer or solo: set the glasses, then hide. Hand the device over only after you tap Hide and hand over."

    /// "Pour four glasses" in the mockup: how many glasses the pourer sets out.
    static func pourTitle(_ count: Int) -> String {
        let words = ["zero", "one", "two", "three", "four", "five", "six"]
        return "Pour \(count < words.count ? words[count] : String(count)) \(count == 1 ? "glass" : "glasses")"
    }

    /// Spoken after an arrow press: where the item is now.
    static func moved(_ label: String, to index: Int, of count: Int) -> String { "\(label), number \(index + 1) of \(count)" }
}
