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

extension Field {
    init(original: String, text: String) {
        self.init(original)
        self.text = text
    }
}

/// Proof is what is stored; ABV is half of it. Decimal, so 50.5 stays 101 and not 100.99999.
enum Strength {
    static func abv(fromProof proof: String) -> String {
        guard let p = Decimal(string: proof.trimmingCharacters(in: .whitespaces)) else { return "" }
        return plainNumber("\(p / 2)") ?? ""
    }

    static func proof(fromABV abv: String) -> String {
        let t = abv.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, var a = Decimal(string: t) else { return t.isEmpty ? "" : t }
        a *= 2
        var rounded = Decimal()
        NSDecimalRound(&rounded, &a, 2, .plain)  // proof is saved with two places
        return plainNumber("\(rounded)") ?? ""
    }
}

extension Strength {
    /// Navy Strength or Overproof, worked out from the proof as the server does (rum: 54% ABV and 57%; gin: 54%, no Overproof).
    static func tier(group: String?, proof: String) -> String? {
        guard group == "rum" || group == "gin", let p = Decimal(string: proof.trimmingCharacters(in: .whitespaces)) else { return nil }
        let abv = p / 2
        if group == "rum", abv >= 57 { return "Overproof" }
        return abv >= 54 ? "Navy Strength" : nil
    }
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
    case store = "storeId"
    case opened = "dateOpened"
    case distilled = "barrelFilledOn"
    case bottled = "bottledOn"
}

struct BottleDraft {
    private(set) var fields: [BottleFact: Field]
    /// The batch and year shown on a bottle with a chosen release are the release's, so they are not this bottle's to edit.
    let fromRelease: Bool
    let wasOpen: Bool
    let originalFill: Int
    /// The store's name for display; the field holds its id.
    var storeName: String?
    /// The label's dates, which this bottle goes by unless it has its own.
    let labelDistilled: String?
    let labelBottled: String?

    init(_ bottle: BottleDetail) {
        storeName = bottle.store
        labelDistilled = bottle.labelBarrelFilledOn
        labelBottled = bottle.labelBottledOn
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
            .store: Field(bottle.storeId.map(String.init)),
            .opened: Field(bottle.dateOpened.map { String($0.prefix(10)) }),
            .distilled: Field(bottle.barrelFilledOn.map { String($0.prefix(10)) }),
            .bottled: Field(bottle.bottledOn.map { String($0.prefix(10)) }),
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
        for date in [BottleFact.acquired, .opened, .distilled, .bottled] where self[date].changed && !self[date].isEmpty && self[date].trimmed > today {
            found[date] = "That date is in the future."
        }
        return found
    }

    /// A fact as the request carries it: the store as its id, everything else as typed, and nothing as null.
    private func sent(_ fact: BottleFact, _ text: String) -> Any {
        if text.isEmpty { return NSNull() }
        return fact == .store ? (Int(text) ?? NSNull()) : text
    }

    /// The request that saves the changes. `choice` is required when the Opened date of an open bottle is cleared.
    func patch(choice: OpenedChoice? = nil) -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts { body[fact.rawValue] = sent(fact, self[fact].trimmed) }
        if clearsOpened, let choice { body["ifOpenedCleared"] = choice.rawValue }
        return body
    }

    /// The request that puts the bottle back as it was before `patch(choice:)` was applied.
    func undoPatch(choice: OpenedChoice? = nil) -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts where fact != .opened { body[fact.rawValue] = sent(fact, self[fact].original) }
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
    case brand = "brandId"
    case name
    case category = "categoryId"
    case proof
    case ageYears, ageMonths, ageDays
    case ageStatement
    case isNas, isStraight, isCaskStrength, isBottledInBond
    case base = "molassesOrCane"
    case size = "sizeMl"
    case msrp
    case barcode = "upc"
    case description, otherNames
    case distilled = "barrelFilledOn"
    case bottled = "bottledOn"
    case isStillProof

    /// The ticks, held as "true" or "false".
    static let ticks: [LabelFact] = [.isCaskStrength, .isBottledInBond, .isStraight, .isNas, .isStillProof]
}

/// The three ordered lists a label carries.
enum LinkList: CaseIterable { case distilleries, mashbills, finishes }

struct LabelDraft {
    private(set) var fields: [LabelFact: Field]
    /// The category's and brand's names for display; the fields hold their ids.
    var categoryName: String
    var brandName: String
    private(set) var links: LabelLinks
    private let originalLinks: LabelLinks

    /// A label not made yet: nothing filled in, the usual 750 mL. `patch()` then holds only what was typed.
    init() {
        categoryName = ""
        brandName = ""
        links = LabelLinks(distilleries: [], mashbills: [], finishes: [])
        originalLinks = links
        fields = Dictionary(uniqueKeysWithValues: LabelFact.allCases.map { ($0, Field(nil)) })
        fields[.size] = Field("750")
        for tick in LabelFact.ticks { fields[tick] = Field("false") }
    }

    init(_ label: LabelDetail) {
        categoryName = label.category
        brandName = label.brand
        links = label.links ?? LabelLinks(distilleries: [], mashbills: [], finishes: [])
        originalLinks = links
        fields = [
            .brand: Field(label.brandId.map(String.init)),
            .name: Field(label.name),
            .category: Field(label.categoryId.map(String.init)),
            .proof: Field(plainNumber(label.proof)),
            .ageYears: Field(plainNumber(label.ageYears)),
            .ageMonths: Field(label.ageMonths.map(String.init)),
            .ageDays: Field(label.ageDays.map(String.init)),
            .ageStatement: Field(label.ageStatement),
            .isNas: Field(String(label.isNas ?? false)),
            .isStraight: Field(String(label.isStraight ?? false)),
            .isCaskStrength: Field(String(label.isCaskStrength ?? false)),
            .isBottledInBond: Field(String(label.isBottledInBond ?? false)),
            .base: Field(label.molassesOrCane),
            .description: Field(label.description),
            .distilled: Field(label.barrelFilledOn),
            .bottled: Field(label.bottledOn),
            .isStillProof: Field(String(label.isStillProof ?? false)),
            .otherNames: Field(label.otherNames),
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
    var linksChanged: Bool { links != originalLinks }
    var isDirty: Bool { !changedFacts.isEmpty || linksChanged }

    func rows(_ list: LinkList) -> [LinkRow] {
        switch list {
        case .distilleries: links.distilleries
        case .mashbills: links.mashbills
        case .finishes: links.finishes
        }
    }

    /// Makes a list exactly `items`, in that order. A row already on the label keeps its share and the rest of what it
    /// carries; one just ticked starts with none, and the server fills in what follows from the label.
    mutating func setList(_ list: LinkList, to items: [LookupItem]) {
        let current = rows(list)
        let next = items.map { item in current.first { $0.id == item.id } ?? LinkRow(id: item.id, name: item.name) }
        switch list {
        case .distilleries: links.distilleries = next
        case .mashbills: links.mashbills = next
        case .finishes: links.finishes = next
        }
        settleSources()
    }

    /// Which distillery made each mashbill, by the server's rule: with one distillery on the label it made them all; with
    /// several, a choice stays only while that distillery is still on the label. So the draft shows, and sends, what the
    /// server will keep.
    private mutating func settleSources() {
        let ids = Set(links.distilleries.map(\.id))
        let solo = links.distilleries.count == 1 ? links.distilleries[0].id : nil
        for i in links.mashbills.indices {
            let chosen = links.mashbills[i].distilleryId.flatMap { ids.contains($0) ? $0 : nil }
            links.mashbills[i].distilleryId = solo ?? chosen
        }
    }

    /// Says which of the label's distilleries made a mashbill; nil clears it.
    mutating func setSource(ofMashbill id: Int, to distilleryId: Int?) {
        guard let i = links.mashbills.firstIndex(where: { $0.id == id }) else { return }
        links.mashbills[i].distilleryId = distilleryId
        settleSources()
    }

    /// Whether a list differs from what the label had, by which rows and in what order.
    func listChanged(_ list: LinkList) -> Bool {
        let before: [LinkRow] = switch list {
        case .distilleries: originalLinks.distilleries
        case .mashbills: originalLinks.mashbills
        case .finishes: originalLinks.finishes
        }
        return rows(list) != before
    }

    /// Takes one row off a list.
    mutating func remove(_ list: LinkList, id: Int) {
        setList(list, to: rows(list).filter { $0.id != id }.map { LookupItem(id: $0.id, name: $0.name) })
    }

    /// A list as the request carries it: ids and shares in order, and what a row of that kind also says.
    private static func request(_ list: LinkList, _ rows: [LinkRow]) -> [[String: Any]] {
        rows.map { row in
            var entry: [String: Any] = ["id": row.id, "amount": row.amount ?? NSNull()]
            if list == .mashbills { entry["distilleryId"] = row.distilleryId ?? NSNull() }
            if list == .distilleries { entry["inferred"] = row.inferred ?? false }
            return entry
        }
    }

    /// A calendar date as the server takes it: year-month-day.
    static func isDate(_ text: String) -> Bool {
        guard matches(text, #"^\d{4}-\d{2}-\d{2}$"#) else { return false }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: text) != nil
    }

    /// The name has started to say something it did not before: tick that, as the web form does. Only on the change, so
    /// a switch turned off by hand stays off while the name still says it.
    mutating func apply(_ said: NameSays, after previous: NameSays) {
        if said.isCaskStrength, !previous.isCaskStrength { self[.isCaskStrength].text = "true" }
        if said.isBottledInBond, !previous.isBottledInBond {
            self[.isBottledInBond].text = "true"
            if let proof = said.proof { self[.proof].text = proof }
            if let years = said.ageYears, !AgeDefaults.ageFilled(self) { self[.ageYears].text = years }
        }
    }

    /// A barcode typed with spaces or dashes, as digits.
    static func digits(_ raw: String) -> String { raw.filter { !$0.isWhitespace && $0 != "-" } }

    func errors() -> [LabelFact: String] {
        var found: [LabelFact: String] = [:]
        if self[.name].changed, self[.name].isEmpty { found[.name] = "Required." }
        let proof = self[.proof]
        if proof.changed, !proof.isEmpty {
            if !matches(proof.trimmed, #"^\d{1,3}(\.\d{1,2})?$"#) || (Double(proof.trimmed) ?? 0) > 200 { found[.proof] = "Proof is a number from 0 to 200." }
        }
        let years = self[.ageYears]
        if years.changed, !years.isEmpty, !(matches(years.trimmed, #"^\d{1,3}(\.\d{1,2})?$"#) && (Double(years.trimmed) ?? 101) <= 100) { found[.ageYears] = "Years from 0 to 100." }
        let months = self[.ageMonths]
        if months.changed, !months.isEmpty, !(matches(months.trimmed, #"^\d{1,4}$"#) && (Int(months.trimmed) ?? 1201) <= 1200) { found[.ageMonths] = "Months from 0 to 1200." }
        let days = self[.ageDays]
        if days.changed, !days.isEmpty, !(matches(days.trimmed, #"^\d{1,5}$"#) && (Int(days.trimmed) ?? 40001) <= 40000) { found[.ageDays] = "Days from 0 to 40000." }
        let size = self[.size]
        if size.changed, !(matches(size.trimmed, #"^\d{1,5}$"#) && (1...20000).contains(Int(size.trimmed) ?? 0)) { found[.size] = "Size is in millilitres, like 750." }
        let msrp = self[.msrp]
        if msrp.changed, !msrp.isEmpty, !matches(msrp.trimmed, #"^\d{1,8}(\.\d{1,2})?$"#) { found[.msrp] = priceMessage }
        for date in [LabelFact.distilled, .bottled] where self[date].changed && !self[date].isEmpty && !Self.isDate(self[date].trimmed) {
            found[date] = "Enter a date like 2019-05-14."
        }
        let upc = self[.barcode]
        if upc.changed, !upc.isEmpty, !matches(Self.digits(upc.trimmed), #"^\d{6,32}$"#) { found[.barcode] = "A barcode is 6 to 32 digits." }
        return found
    }

    private func value(_ fact: LabelFact, of field: Field) -> Any {
        switch fact {
        case .size, .category, .brand, .ageMonths, .ageDays: Int(field.trimmed) ?? field.json
        case .isNas, .isStraight, .isCaskStrength, .isBottledInBond, .isStillProof: field.trimmed == "true"
        case .barcode: field.isEmpty ? NSNull() : Self.digits(field.trimmed)
        default: field.json
        }
    }

    private static func key(_ list: LinkList) -> String {
        switch list {
        case .distilleries: "distilleries"
        case .mashbills: "mashbills"
        case .finishes: "finishes"
        }
    }

    func patch() -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts { body[fact.rawValue] = value(fact, of: self[fact]) }
        // The three lists are rewritten together (which distillery made each mashbill depends on the distillery list).
        if linksChanged { for list in LinkList.allCases { body[Self.key(list)] = Self.request(list, rows(list)) } }
        return body
    }

    func undoPatch() -> [String: Any] {
        var body: [String: Any] = [:]
        for fact in changedFacts {
            let field = self[fact]
            body[fact.rawValue] = field.original.isEmpty ? NSNull() : value(fact, of: Field(field.original))
        }
        if linksChanged {
            for list in LinkList.allCases {
                let before: [LinkRow] = switch list {
                case .distilleries: originalLinks.distilleries
                case .mashbills: originalLinks.mashbills
                case .finishes: originalLinks.finishes
                }
                body[Self.key(list)] = Self.request(list, before)
            }
        }
        return body
    }
}
