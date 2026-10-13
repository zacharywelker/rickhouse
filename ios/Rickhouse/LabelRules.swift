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
