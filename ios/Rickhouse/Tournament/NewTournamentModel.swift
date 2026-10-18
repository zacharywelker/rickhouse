import Foundation

// The new-tournament form's decisions, kept out of the views so they can be tested (the web's tournament-setup.tsx
// holds the same rules inline: name required, any number of entries, starting needs 2).

struct NewTournamentDraft: Equatable {
    static let maxName = 80
    static let maxNote = 200

    var name = ""
    var heatSize = 4
    var blind = false
    var seeding = Seeding.similar
    var groupOrder = TournamentPriority.defaultOrder
    var fieldNote = ""
    var field = FieldState.empty

    var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Only a missing name stops the create: a draft may be filled later.
    var canCreate: Bool { !trimmedName.isEmpty }

    /// Why Create is off, nil when it is on.
    var disabledReason: String? { canCreate ? nil : "Give the tournament a name to create it." }

    /// The one line above Create.
    var helperLine: String {
        let total = field.entries.count
        if total < 2 {
            return "\(total == 0 ? "No entries yet" : "One entry"): you can make the draft now and fill the field later. Starting needs at least 2."
        }
        return "\(total) entries in flights of \(heatSize). The field and settings stay editable until you start."
    }

    /// The create call's body.
    var request: NewTournament {
        let note = fieldNote.trimmingCharacters(in: .whitespacesAndNewlines)
        return NewTournament(name: trimmedName, heatSize: heatSize, seeding: seeding, groupOrder: groupOrder, blind: blind,
                             fieldNote: note.isEmpty ? nil : note, entries: TournamentFieldSelection.toEntryInputs(field.entries))
    }
}

/// A 422's per-field messages, by the API's names (`name`, `heatSize`, `entries` ...). A key like `entries.3` counts for `entries`.
struct FormFieldErrors: Equatable {
    var fields: [String: String] = [:]

    func message(for field: String) -> String? {
        fields[field] ?? fields.first { $0.key.hasPrefix(field + ".") }?.value
    }
}

/// Which answer is the latest: a typed search can be answered after a newer one was sent, and must then be dropped.
struct RequestTicket {
    private var latest = 0
    mutating func issue() -> Int { latest += 1; return latest }
    func isCurrent(_ ticket: Int) -> Bool { ticket == latest }
}

extension FieldFilters {
    /// What is on the shelf: the same default as the Collection and the web picker.
    static let shelfStatuses: Set<String> = ["owned", "open"]
    /// Every real bottle status, in the web picker's order.
    static let allStatuses = ["owned", "open", "killed", "sold", "traded", "wishlist", "sampled"]

    static let initial = FieldFilters(statuses: shelfStatuses)

    /// A status chip toggled. An empty set means every status (the server's "all").
    func togglingStatus(_ status: String) -> FieldFilters {
        var next = self
        var set = statuses ?? Self.shelfStatuses
        if set.contains(status) { set.remove(status) } else { set.insert(status) }
        next.statuses = set
        return next
    }
}

enum FieldPickerText {
    /// "Showing 500 of 812 matches" when the search was cut short, nil otherwise.
    static func cutoffLine(shown: Int, total: Int) -> String? {
        total > shown ? "Showing \(shown) of \(total) matches" : nil
    }

    /// "3 of 30 chosen".
    static func chosenLine(chosen: Int, shown: Int) -> String { "\(chosen) of \(shown) chosen" }

    /// The row on the form: "Field · 12 chosen".
    static func summaryTitle(_ total: Int) -> String { "Field · \(total) chosen" }

    /// How an entry is marked in the chosen list.
    static func kind(_ entry: PickedEntry) -> String {
        switch entry {
        case .bottle: "Bottle"
        case .label: "Label only"
        case .adhoc: "Outside entry"
        }
    }
}
