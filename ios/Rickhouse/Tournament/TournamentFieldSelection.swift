import Foundation

// Mirrors src/lib/tournaments/field-selection.ts: change both together.
// Swift shape: the entries are an enum of structs, and the reducer is `TournamentFieldSelection.reduce`.

struct PickedBottle: Equatable { let bottleId: Int; let expressionId: Int; let name: String }
struct PickedLabel: Equatable { let expressionId: Int; let name: String }
struct PickedAdhoc: Equatable { let key: String; let name: String }

enum PickedEntry: Equatable {
    case bottle(PickedBottle)
    case label(PickedLabel)
    case adhoc(PickedAdhoc)

    /// A stable identity for an entry: a bottle and a label of the same expression are different entries.
    var key: String {
        switch self {
        case .bottle(let b): "b:\(b.bottleId)"
        case .label(let l): "l:\(l.expressionId)"
        case .adhoc(let a): "a:\(a.key)"
        }
    }

    var name: String {
        switch self {
        case .bottle(let b): b.name
        case .label(let l): l.name
        case .adhoc(let a): a.name
        }
    }
}

struct FieldState: Equatable {
    var entries: [PickedEntry]
    /// Why the last action was refused or only partly done; nil when it was done in full.
    var notice: String?

    static let empty = FieldState(entries: [], notice: nil)
}

enum FieldAction {
    case toggleBottle(PickedBottle)
    case selectAll([PickedBottle])
    case clear
    case remove(key: String)
    case addLabel(expressionId: Int, name: String)
    case addAdhoc(String)
}

struct FieldCounts: Equatable { let bottles: Int; let labels: Int; let adhoc: Int; let total: Int }

enum TournamentFieldSelection {
    /// The most entries a tournament holds (the API's limit).
    static let maxEntries = 500
    /// The longest an outside entry's name may be (the API's limit, counted in UTF-16 units as the web does).
    static let maxName = 120

    private static let capNotice = "A tournament holds up to \(maxEntries) entries."

    /// The identity of an outside entry: its name in lower case with runs of spaces made one.
    private static func collapsed(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
    private static func adhocKey(_ name: String) -> String { collapsed(name).lowercased() }

    private static func ok(_ entries: [PickedEntry]) -> FieldState { FieldState(entries: entries, notice: nil) }
    private static func refused(_ state: FieldState, _ notice: String) -> FieldState { FieldState(entries: state.entries, notice: notice) }

    /// The field being picked, as a pure reducer: nothing here knows about SwiftUI or the network.
    static func reduce(_ state: FieldState, _ action: FieldAction) -> FieldState {
        let entries = state.entries
        switch action {
        case .toggleBottle(let bottle):
            let key = PickedEntry.bottle(bottle).key
            if entries.contains(where: { $0.key == key }) { return ok(entries.filter { $0.key != key }) }
            if entries.count >= maxEntries { return refused(state, capNotice) }
            return ok(entries + [.bottle(bottle)])
        case .selectAll(let bottles):
            let have = Set(entries.map(\.key))
            let fresh = bottles.filter { !have.contains(PickedEntry.bottle($0).key) }
            let room = maxEntries - entries.count
            let next = entries + fresh.prefix(max(room, 0)).map(PickedEntry.bottle)
            return fresh.count > room ? FieldState(entries: next, notice: "\(capNotice) The rest were left out.") : ok(next)
        case .clear:
            return .empty
        case .remove(let key):
            return ok(entries.filter { $0.key != key })
        case .addLabel(let expressionId, let name):
            let entry = PickedEntry.label(PickedLabel(expressionId: expressionId, name: name))
            if entries.contains(where: { $0.key == entry.key }) { return refused(state, "That label is already in the field.") }
            if entries.count >= maxEntries { return refused(state, capNotice) }
            return ok(entries + [entry])
        case .addAdhoc(let raw):
            let name = collapsed(raw)
            if name.isEmpty { return state }
            if name.utf16.count > maxName { return refused(state, "Up to \(maxName) characters.") }
            let entry = PickedEntry.adhoc(PickedAdhoc(key: adhocKey(name), name: name))
            if entries.contains(where: { $0.key == entry.key }) { return refused(state, "That outside entry is already in the field.") }
            if entries.count >= maxEntries { return refused(state, capNotice) }
            return ok(entries + [entry])
        }
    }

    /// The field as the create call takes it.
    static func toEntryInputs(_ entries: [PickedEntry]) -> [EntryInput] {
        entries.map {
            switch $0 {
            case .bottle(let b): .bottle(b.bottleId)
            case .label(let l): .label(l.expressionId)
            case .adhoc(let a): .outside(a.name)
            }
        }
    }

    static func counts(_ entries: [PickedEntry]) -> FieldCounts {
        var (b, l, a) = (0, 0, 0)
        for e in entries {
            switch e { case .bottle: b += 1; case .label: l += 1; case .adhoc: a += 1 }
        }
        return FieldCounts(bottles: b, labels: l, adhoc: a, total: entries.count)
    }

    /// How many of the bottles on show (by bottle id) are in the field.
    static func chosenAmong(_ entries: [PickedEntry], shown: [Int]) -> Int {
        let have = Set(entries.compactMap { if case .bottle(let b) = $0 { b.bottleId } else { nil } })
        return shown.filter(have.contains).count
    }

    /// The field picker's starting state for an existing draft: its entries as they are, a bottle entry as a bottle,
    /// a label-only one as a label, an outside one as ad hoc. Withdrawn entries are left out.
    static func fieldFromEntries(_ entries: [TournamentEntry]) -> FieldState {
        ok(entries.filter { $0.status == .active }.compactMap { e in
            switch e.kind {
            case .bottle:
                guard let b = e.bottleId, let x = e.expressionId else { return nil }
                return .bottle(PickedBottle(bottleId: b, expressionId: x, name: e.name))
            case .label:
                guard let x = e.expressionId else { return nil }
                return .label(PickedLabel(expressionId: x, name: e.name))
            case .adhoc:
                return .adhoc(PickedAdhoc(key: adhocKey(e.name), name: e.name))
            }
        })
    }
}
