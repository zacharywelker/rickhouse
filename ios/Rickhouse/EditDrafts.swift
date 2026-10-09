import Foundation

/// The logic of editing a bottle's or a label's facts, apart from any screen (docs/superpowers/specs/2026-10-08-edit-facts-design.md):
/// what has changed, what to send, what to send to put it back, and what is wrong before asking the server.

/// What to do with a bottle that is open when its Opened date is cleared. The server asks rather than choosing.
enum OpenedChoice: String {
    case keepOpen = "keep_open"
    /// Closed, level back to full, whatever the level was.
    case seal
}

struct LabelRef: Equatable {
    let id: Int
    let title: String
}

/// One fact being edited: what it was, and what it is now. Empty means no value.
struct Field: Equatable {
    let original: String
    var text: String

    init(_ value: String?) {
        let value = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        original = value
        text = value
    }

    var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    var isEmpty: Bool { trimmed.isEmpty }
    var changed: Bool { trimmed != original }

    /// For the request: a cleared fact goes as null, which the server reads as "clear it".
    var json: Any { trimmed.isEmpty ? NSNull() : trimmed }
    var originalJSON: Any { original.isEmpty ? NSNull() : original }

    mutating func revert() { text = original }
}

/// "116.80" as "116.8" and "100.00" as "100": a proof as a person would type it back.
func plainNumber(_ raw: String?) -> String? {
    guard var s = raw, s.contains(".") else { return raw }
    while s.hasSuffix("0") { s.removeLast() }
    if s.hasSuffix(".") { s.removeLast() }
    return s
}

private func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: .regularExpression) != nil
}

private let priceMessage = "Enter a price like 54.99."

// MARK: Bottle

enum BottleFact: String, CaseIterable {
    case paid = "pricePaid"
    case acquired = "dateAcquired"
    case batch
    case releaseYear
    case barrel = "barrelNumber"
    case pick = "pickName"
    case location
    case notes
    case opened = "dateOpened"
}

struct BottleDraft {
    private(set) var fields: [BottleFact: Field]
    /// The batch and year shown on a bottle with a chosen release are the release's, so they are not this bottle's to edit.
    let fromRelease: Bool
    let wasOpen: Bool
    let originalFill: Int

    init(_ bottle: BottleDetail) {
        fromRelease = bottle.releaseId != nil
        wasOpen = bottle.isOpen
        originalFill = bottle.fillPct
        fields = [
            .paid: Field(bottle.pricePaid),
            .acquired: Field(bottle.dateAcquired.map { String($0.prefix(10)) }),
            .batch: Field(bottle.batch),
            .releaseYear: Field(bottle.releaseYear.map(String.init)),
            .barrel: Field(bottle.barrelNumber),
            .pick: Field(bottle.pickName),
            .location: Field(bottle.location),
            .notes: Field(bottle.notes),
            .opened: Field(bottle.dateOpened.map { String($0.prefix(10)) }),
        ]
    }

    subscript(fact: BottleFact) -> Field {
        get { fields[fact]! }
        set { fields[fact] = newValue }
    }

    private func locked(_ fact: BottleFact) -> Bool { fromRelease && (fact == .batch || fact == .releaseYear) }

    var changedFacts: [BottleFact] { BottleFact.allCases.filter { !locked($0) && self[$0].changed } }
    var isDirty: Bool { !changedFacts.isEmpty }

    /// The Opened date was removed from a bottle that is open: the server needs to be told what to do with it.
    var clearsOpened: Bool { self[.opened].changed && self[.opened].isEmpty && wasOpen }

    /// What is wrong before the server is asked, by fact. Dates cannot be in the future (`today` is "yyyy-MM-dd").
    func errors(today: String) -> [BottleFact: String] {
        var found: [BottleFact: String] = [:]
        let paid = self[.paid]
        if paid.changed, !paid.isEmpty, !matches(paid.trimmed, #"^\d{1,8}(\.\d{1,2})?$"#) { found[.paid] = priceMessage }
        let year = self[.releaseYear]
        if !locked(.releaseYear), year.changed, !year.isEmpty, !matches(year.trimmed, #"^(1[7-9]|2[01])\d\d$"#) { found[.releaseYear] = "Enter a four-digit year." }
        for date in [BottleFact.acquired, .opened] where self[date].changed && !self[date].isEmpty && self[date].trimmed > today {
            found[date] = "That date is in the future."
        }
        return found
    }

    /// The request that saves the changes. `choice` is required when the Opened date of an open bottle is cleared.
    func patch(choice: OpenedChoice? = nil) -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts { body[fact.rawValue] = self[fact].json }
        if clearsOpened, let choice { body["ifOpenedCleared"] = choice.rawValue }
        return body
    }

    /// The request that puts the bottle back as it was before `patch(choice:)` was applied.
    func undoPatch(choice: OpenedChoice? = nil) -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts where fact != .opened { body[fact.rawValue] = self[fact].originalJSON }
        if self[.opened].changed {
            body["dateOpened"] = self[.opened].originalJSON
            // Taking a date away from a bottle the edit had opened: say how, as the first time.
            if self[.opened].original.isEmpty { body["ifOpenedCleared"] = wasOpen ? OpenedChoice.keepOpen.rawValue : OpenedChoice.seal.rawValue }
            // Sealing reset the level; the old one comes back with the old date.
            if choice == .seal { body["fillPct"] = originalFill }
        }
        return body
    }
}

// MARK: Label

enum LabelFact: String, CaseIterable {
    case name
    case category = "categoryId"
    case proof
    case ageStatement
    case size = "sizeMl"
    case msrp
    case barcode = "upc"
}

struct LabelDraft {
    private(set) var fields: [LabelFact: Field]
    /// The category's name for display; the field holds its id.
    var categoryName: String

    init(_ label: LabelDetail) {
        categoryName = label.category
        fields = [
            .name: Field(label.name),
            .category: Field(label.categoryId.map(String.init)),
            .proof: Field(plainNumber(label.proof)),
            .ageStatement: Field(label.ageStatement),
            .size: Field(String(label.sizeMl)),
            .msrp: Field(label.msrp),
            .barcode: Field(label.upc),
        ]
    }

    subscript(fact: LabelFact) -> Field {
        get { fields[fact]! }
        set { fields[fact] = newValue }
    }

    var changedFacts: [LabelFact] { LabelFact.allCases.filter { self[$0].changed } }
    var isDirty: Bool { !changedFacts.isEmpty }

    /// A barcode typed with spaces or dashes, as digits.
    static func digits(_ raw: String) -> String { raw.filter { !$0.isWhitespace && $0 != "-" } }

    func errors() -> [LabelFact: String] {
        var found: [LabelFact: String] = [:]
        if self[.name].changed, self[.name].isEmpty { found[.name] = "Required." }
        let proof = self[.proof]
        if proof.changed, !proof.isEmpty {
            if !matches(proof.trimmed, #"^\d{1,3}(\.\d{1,2})?$"#) || (Double(proof.trimmed) ?? 0) > 200 { found[.proof] = "Proof is a number from 0 to 200." }
        }
        let size = self[.size]
        if size.changed, !(matches(size.trimmed, #"^\d{1,5}$"#) && (1...20000).contains(Int(size.trimmed) ?? 0)) { found[.size] = "Size is in millilitres, like 750." }
        let msrp = self[.msrp]
        if msrp.changed, !msrp.isEmpty, !matches(msrp.trimmed, #"^\d{1,8}(\.\d{1,2})?$"#) { found[.msrp] = priceMessage }
        let upc = self[.barcode]
        if upc.changed, !upc.isEmpty, !matches(Self.digits(upc.trimmed), #"^\d{6,32}$"#) { found[.barcode] = "A barcode is 6 to 32 digits." }
        return found
    }

    private func value(_ fact: LabelFact, of field: Field) -> Any {
        switch fact {
        case .size, .category: Int(field.trimmed) ?? field.json
        case .barcode: field.isEmpty ? NSNull() : Self.digits(field.trimmed)
        default: field.json
        }
    }

    func patch() -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts { body[fact.rawValue] = value(fact, of: self[fact]) }
        return body
    }

    func undoPatch() -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts {
            let field = self[fact]
            body[fact.rawValue] = field.original.isEmpty ? NSNull() : value(fact, of: Field(field.original))
        }
        return body
    }
}
