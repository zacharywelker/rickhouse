import Foundation

/// What a picker decides apart from drawing: which names match what was typed, which look like it, and whether to
/// offer to make a new one (docs/superpowers/specs/2026-10-08-edit-facts-design.md, section 1).
enum PickerLogic {
    /// "Wild  Turkey" and "wild turkey" and "Wild Turkéy": the same name for matching.
    static func normalize(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// Names that contain what was typed, in the order given. Everything when nothing has been typed.
    static func matching(_ query: String, in items: [LookupItem]) -> [LookupItem] {
        let q = normalize(query)
        guard !q.isEmpty else { return items }
        return items.filter { normalize($0.name).contains(q) }
    }

    /// A name already there that is exactly what was typed, whatever the case or spacing.
    static func exact(_ query: String, in items: [LookupItem]) -> LookupItem? {
        let q = normalize(query)
        guard !q.isEmpty else { return nil }
        return items.first { normalize($0.name) == q }
    }

    /// Names that are not what was typed but look like it: one inside the other, or a typo or two apart. Offered before
    /// "add a new one", so one distillery doesn't end up with two spellings.
    static func nearMatches(_ query: String, in items: [LookupItem], limit: Int = 3) -> [LookupItem] {
        let q = normalize(query)
        guard q.count >= 3 else { return [] }
        let found = items.filter { item in
            let name = normalize(item.name)
            if name == q { return false }
            if name.contains(q) || q.contains(name) { return true }
            return min(name.count, q.count) >= 4 && distance(name, q) <= 2
        }
        return Array(found.prefix(limit))
    }

    /// Whether the last row, "Add “X” as a new distillery", is shown: something typed, nothing exactly like it, and a kind
    /// a name is enough to make.
    static func offersNew(_ query: String, kind: LookupKind, in items: [LookupItem]) -> Bool {
        kind.creatable && !normalize(query).isEmpty && exact(query, in: items) == nil
    }

    /// Edits between two strings (insert, delete, substitute).
    static func distance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var row = Array(0...b.count)
        for i in 1...a.count {
            var previous = row[0]
            row[0] = i
            for j in 1...b.count {
                let kept = row[j]
                row[j] = a[i - 1] == b[j - 1] ? previous : min(previous, row[j], row[j - 1]) + 1
                previous = kept
            }
        }
        return row[b.count]
    }
}
