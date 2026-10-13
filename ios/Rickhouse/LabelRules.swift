import Foundation

/// What a label's category decides about its form, the same rules as the web (`src/lib/expressions/rules.ts` and
/// `src/lib/bottles/age.ts`): vodka and unaged gin have no aging or finishes, Straight and Bottled In Bond are American
/// only, rum records a base instead of a mashbill, Bottled In Bond is 100 proof.
struct LabelRules {
    /// "whiskey", "rum", "gin", "vodka"…; nil when the server didn't say, which shows everything.
    var group: String?
    /// "american", "scotch" or "other"; nil when unknown, which leaves Straight and Bottled In Bond showing.
    var kind: String?
    /// Gin only: pressed "Aged", or it already carries something only an aged gin has.
    var ginAged = false

    init(category: CategoryOption?, ginAged: Bool = false) {
        group = category?.group
        kind = category?.kind
        self.ginAged = ginAged
    }

    var isUnaged: Bool { group == "vodka" || (group == "gin" && !ginAged) }
    var showsAging: Bool { !isUnaged }
    var showsFinishes: Bool { !isUnaged }
    /// Straight and Bottled In Bond are American designations.
    var showsAmerican: Bool { showsAging && (kind == nil || kind == "american") }
    var baseReplacesMashbill: Bool { group == "rum" }
    var isGin: Bool { group == "gin" }
    /// Tequila and mezcal: unaged ones can be marked still proof.
    var showsStillProof: Bool { group == "agave" }

    /// A gin that already has an age, a statement, NAS or a finish opens as aged.
    static func looksAged(_ draft: LabelDraft) -> Bool {
        AgeDefaults.ageFilled(draft) || !draft[.ageStatement].isEmpty || draft[.isNas].trimmed == "true" || !draft.rows(.finishes).isEmpty
    }

    /// What the save sends for an unaged gin: no finishes, as the web form does. (Vodka keeps any it had.)
    func prepared(_ draft: LabelDraft) -> LabelDraft {
        guard group == "gin", !ginAged, !draft.rows(.finishes).isEmpty else { return draft }
        var next = draft
        next.setList(.finishes, to: [])
        return next
    }

    static let bondProof = "100"
    static let rumBases: [(value: String, title: String)] = [("molasses", "Molasses"), ("sugarcane", "Sugarcane"), ("honey", "Honey"), ("other", "Other")]
    static let sizes = [200, 375, 500, 700, 750, 1000]

    static func sizeTitle(_ ml: Int) -> String {
        ml >= 1000 && ml % 250 == 0 ? "\((Double(ml) / 1000).formatted()) L" : "\(ml) mL"
    }
}

/// The age a tick implies and the statement it offers, only ever over a blank or over what the ticks put there before.
enum AgeDefaults {
    static func ageFilled(_ draft: LabelDraft) -> Bool {
        !(draft[.ageYears].isEmpty && draft[.ageMonths].isEmpty && draft[.ageDays].isEmpty)
    }

    private static func on(_ draft: LabelDraft, _ fact: LabelFact) -> Bool { draft[fact].trimmed == "true" }

    /// 4 years for Bottled In Bond; else 2 for Straight, 4 when it also has no age statement; blank otherwise.
    static func impliedYears(_ draft: LabelDraft) -> String {
        if on(draft, .isBottledInBond) { return "4" }
        guard on(draft, .isStraight) else { return "" }
        return on(draft, .isNas) ? "4" : "2"
    }

    /// Only NAS has a statement of its own; Bottled In Bond and Straight imply years instead.
    static func defaultStatement(_ draft: LabelDraft) -> String {
        on(draft, .isNas) ? "NAS" : ""
    }

    /// `next` is `prev` with `changed` switched; returns it with the age, statement and (for Bottled In Bond) proof that follow.
    static func apply(prev: LabelDraft, next: LabelDraft, changed: LabelFact) -> LabelDraft {
        var next = next
        guard prev[changed].trimmed != next[changed].trimmed else { return next }

        if changed == .isStraight || changed == .isNas || changed == .isBottledInBond {
            let was = impliedYears(prev)
            let years = prev[.ageYears].trimmed
            if prev[.ageMonths].isEmpty, prev[.ageDays].isEmpty, years.isEmpty || years == was {
                next[.ageYears].text = impliedYears(next)
            }
        }
        if changed == .isNas, !ageFilled(next) {
            let current = prev[.ageStatement].trimmed
            if current.isEmpty || current == defaultStatement(prev) { next[.ageStatement].text = defaultStatement(next) }
        }
        if changed == .isBottledInBond, on(next, .isBottledInBond) { next[.proof].text = LabelRules.bondProof }
        return next
    }
}

/// Age from a fill (distillation) date and a bottling date, the same calendar rule as the web (`src/lib/bottles/age.ts`):
/// whole months by the calendar with the day clamped to the end of the month, then the days left over.
struct DatedAge: Equatable {
    let years: Int
    let months: Int
    let days: Int

    private static var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private static func date(_ text: String) -> Date? {
        guard text.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return nil }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: text)
    }

    /// Nil when either date is missing or not a real date, or the bottling is before the fill.
    init?(filled: String, bottled: String) {
        guard let from = Self.date(filled), let to = Self.date(bottled), to >= from else { return nil }
        let cal = Self.calendar
        // Adding months to a date clamps the day to the end of the target month, as a person would.
        var months = cal.dateComponents([.month], from: from, to: to).month ?? 0
        if let anchor = cal.date(byAdding: .month, value: months, to: from), anchor > to { months -= 1 }
        guard let anchor = cal.date(byAdding: .month, value: months, to: from) else { return nil }
        years = months / 12
        self.months = months % 12
        days = cal.dateComponents([.day], from: anchor, to: to).day ?? 0
    }

    /// "12 Year", "12 Year 5 Month", or days when there is nothing bigger.
    var described: String {
        var parts: [String] = []
        if years > 0 { parts.append("\(years) Year") }
        if months > 0 { parts.append("\(months) Month") }
        if parts.isEmpty { parts.append("\(days) Day") }
        return parts.joined(separator: " ")
    }
}
