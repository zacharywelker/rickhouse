import Foundation

/// One ingredient row of a mashbill being made. `percent` is the text as typed, so half-typed numbers survive.
struct GrainRow: Identifiable, Equatable {
    let id = UUID()
    var grain = ""
    var percent = ""

    var isBlank: Bool { grain.trimmingCharacters(in: .whitespaces).isEmpty && percent.trimmingCharacters(in: .whitespaces).isEmpty }
    /// The share as a number; a comma is accepted for a decimal point. Nil while it is empty or not a number.
    var share: Double? { Double(percent.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) }
}

/// A new mashbill as the phone's pop-up holds it (issue #223). The fields and rules are the web's mashbill form: a
/// recipe of ingredient rows, or a secret mashbill (a reference name, recipe optional), or a generic style (a name,
/// no recipe). The server judges every value through the same rules as the web; `problem` repeats them so the page
/// can say what is wrong before a round trip, and the server's word is final.
struct MashbillDraft: Equatable {
    var isSecret = false
    var isGeneric = false
    var isPartial = false
    var name = ""
    var notes = ""
    var rows: [GrainRow] = []

    /// Offered when adding an ingredient, in the order a whiskey person would reach for them (the web's list). Not a
    /// closed set: anything can be typed.
    static let commonGrains = [
        "Corn", "Rye", "Wheat", "Malted Barley", "Sugarcane", "Molasses", "Agave", "Malted Rye", "Malted Wheat",
        "Oats", "Triticale", "Spelt", "Barley", "Millet", "Quinoa", "Buckwheat", "Sorghum", "Brown Rice",
    ]

    /// The share the database allows a recipe to add up to, with its slack for rounded published bills.
    static let allowedTotal = 99.0...101.0

    /// A secret mashbill and a generic style are different things: turning one on turns the other off.
    mutating func setSecret(_ on: Bool) { isSecret = on; if on { isGeneric = false } }
    mutating func setGeneric(_ on: Bool) { isGeneric = on; if on { isSecret = false; isPartial = false } }

    /// The name is shown in place of the recipe, so it is only asked for when there isn't one to show.
    var showsName: Bool { isSecret || isGeneric }
    /// A style has no recipe.
    var showsIngredients: Bool { !isGeneric }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    /// Rows with something in them; a row left empty is ignored rather than refused.
    private var filled: [GrainRow] { rows.filter { !$0.isBlank } }

    /// What the disclosed shares add up to (a share that isn't a number counts as 0).
    var total: Double { filled.reduce(0) { $0 + ($1.share ?? 0) } }
    var roundedTotal: Double { (total * 100).rounded() / 100 }

    /// How the running total stands, for the line under it.
    enum TotalStatus: Equatable {
        case exact
        /// Off 100 but inside what the database allows.
        case tolerated
        case short(Double)
        case over(Double)
        /// A partial disclosure with shares left unknown.
        case undisclosed(Double)
    }

    var totalStatus: TotalStatus {
        let t = roundedTotal
        if t == 100 { return .exact }
        if t > Self.allowedTotal.upperBound { return .over(((t - 100) * 100).rounded() / 100) }
        if t < Self.allowedTotal.lowerBound {
            let gap = ((100 - t) * 100).rounded() / 100
            return isPartial ? .undisclosed(gap) : .short(gap)
        }
        return .tolerated
    }

    /// The first thing wrong, in the web's words, or nil when it can be sent. Mirrors `mashbillSchema` and the
    /// duplicate-grain check; the recipe-already-exists check needs the server.
    var problem: String? {
        if isSecret && isGeneric { return "A mashbill is a secret recipe or a generic style, not both." }
        if isGeneric { return trimmedName.isEmpty ? "Name the style, such as High Rye." : nil }
        if isSecret && trimmedName.isEmpty { return "Give a secret mashbill a reference name, such as Buffalo Trace Wheated." }
        if !isSecret && filled.isEmpty { return "Add at least one ingredient." }

        var seen = Set<String>()
        for row in filled {
            let grain = row.grain.trimmingCharacters(in: .whitespaces)
            if grain.isEmpty { return "Name the grain." }
            guard let share = row.share else { return "Enter the percent for \(grain)." }
            if share <= 0 { return "\(grain): more than 0%." }
            if share > 100 { return "\(grain): 100% at the most." }
            if !seen.insert(grain.lowercased()).inserted { return "\(grain) is in there twice. Combine them into one row." }
        }
        if filled.isEmpty { return nil }
        switch totalStatus {
        case .short(let gap): return "The grains add up to \(Self.text(roundedTotal))%, not 100% (\(Self.text(gap))% short)."
        case .over: return isPartial ? "The disclosed grains exceed 100% (\(Self.text(roundedTotal))%)." : "The grains add up to \(Self.text(roundedTotal))%, not 100%."
        case .exact, .tolerated, .undisclosed: return nil
        }
    }

    var canSave: Bool { problem == nil }

    /// Ingredients not already in the recipe, for the "add an ingredient" menu.
    var unusedCommonGrains: [String] {
        Self.commonGrains.filter { grain in !rows.contains { $0.grain.trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(grain) == .orderedSame } }
    }

    /// The JSON the lookups route takes. A style sends no recipe and a recipe sends no name, as the web does.
    func body() -> [String: Any] {
        var json: [String: Any] = [
            "isSecret": isSecret,
            "isGeneric": isGeneric,
            "isPartial": isPartial && !isGeneric,
            "notes": notes.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        if showsName { json["name"] = trimmedName }
        if showsIngredients {
            json["grains"] = filled.map { ["grain": $0.grain.trimmingCharacters(in: .whitespaces), "percent": $0.share ?? 0] as [String: Any] }
        }
        return json
    }

    /// 75 not 75.0, 33.33 as is.
    static func text(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }
}
