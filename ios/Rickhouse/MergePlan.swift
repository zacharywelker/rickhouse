import Foundation

/// The facts a merge can carry over from the label that goes away; any others are the surviving label's
/// (docs/superpowers/specs/2026-10-08-edit-facts-design.md, section 4). The raw values are the API's `keepMine` names.
enum MergeFact: String, CaseIterable {
    case category = "categoryId"
    case proof
    case ageYears
    case ageStatement
    case size = "sizeMl"
    case msrp
    case barcode = "upc"

    var title: String {
        switch self {
        case .category: "Category"
        case .proof: "Proof"
        case .ageYears: "Age in years"
        case .ageStatement: "Age statement"
        case .size: "Size"
        case .msrp: "MSRP"
        case .barcode: "Barcode"
        }
    }
}

/// One fact the two labels disagree about, each side as it reads on screen.
struct MergeRow: Identifiable, Equatable {
    let fact: MergeFact
    let mine: String
    let theirs: String
    var id: String { fact.rawValue }
}

/// Merging `mine` (it goes away) into `theirs` (it stays): what moves, and which facts differ.
struct MergePlan {
    let mine: LabelDetail
    let theirs: LabelDetail

    var mineTitle: String { "\(mine.brand) \(mine.name)" }
    var theirsTitle: String { "\(theirs.brand) \(theirs.name)" }

    var bottleCount: Int { mine.bottles.count }
    var tastingCount: Int { mine.tastings.count }

    private static func count(_ n: Int, _ noun: String) -> String { n == 1 ? "1 \(noun)" : "\(n) \(noun)s" }

    /// "Moves 2 bottles and 4 tastings. The Rare Breed label is then removed."
    var summary: String {
        let moved: String
        switch (bottleCount, tastingCount) {
        case (0, 0): moved = "Nothing is on it to move."
        case (_, 0): moved = "Moves \(Self.count(bottleCount, "bottle"))."
        case (0, _): moved = "Moves \(Self.count(tastingCount, "tasting"))."
        default: moved = "Moves \(Self.count(bottleCount, "bottle")) and \(Self.count(tastingCount, "tasting"))."
        }
        return "\(moved) The \(mine.name) label is then removed."
    }

    /// The facts on which the two disagree, in a fixed order. A fact both leave blank, or write the same way, is not one.
    var rows: [MergeRow] {
        MergeFact.allCases.compactMap { fact in
            Self.comparable(fact, mine) == Self.comparable(fact, theirs)
                ? nil
                : MergeRow(fact: fact, mine: Self.shown(fact, mine), theirs: Self.shown(fact, theirs))
        }
    }

    /// What to send as `keepMine`: the facts the person chose to keep from the label that goes away.
    static func keepMine(_ chosen: Set<MergeFact>) -> [String] {
        MergeFact.allCases.filter(chosen.contains).map(\.rawValue)
    }

    /// A fact reduced to what makes two writings the same: "116.80" and "116.8", a blank and a missing value.
    private static func comparable(_ fact: MergeFact, _ label: LabelDetail) -> String {
        switch fact {
        case .category: label.categoryId.map(String.init) ?? label.category
        case .proof: plainNumber(label.proof)?.trimmed ?? ""
        case .ageYears: plainNumber(label.ageYears)?.trimmed ?? ""
        case .ageStatement: label.ageStatement?.trimmed ?? ""
        case .size: String(label.sizeMl)
        case .msrp: label.msrp.flatMap(Double.init).map { String(format: "%.2f", $0) } ?? ""
        case .barcode: LabelDraft.digits(label.upc ?? "")
        }
    }

    private static func shown(_ fact: MergeFact, _ label: LabelDetail) -> String {
        let none = "None"
        switch fact {
        case .category: return label.category
        case .proof: return Format.proof(label.proof) ?? none
        case .ageYears: return plainNumber(label.ageYears).map { "\($0) years" } ?? none
        case .ageStatement: return label.ageStatement?.trimmed.nonEmpty ?? none
        case .size: return "\(label.sizeMl) mL"
        case .msrp: return label.msrp.map(Format.money) ?? none
        case .barcode: return label.upc?.trimmed.nonEmpty ?? none
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nonEmpty: String? { isEmpty ? nil : self }
}
