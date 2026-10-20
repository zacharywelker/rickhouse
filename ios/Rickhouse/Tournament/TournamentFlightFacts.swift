import Foundation

/// What a Detail row says about a bottle besides its name, proof, mashbill and age. A fact that is not known is left out
/// (the web shows a dash; the phone has the room for neither).
enum TournamentFlightFacts {
    /// "Distillery: MGP, Dickel · Finish: Port", or nil when neither is known.
    static func extraLine(_ row: RowModel) -> String? {
        let parts = [row.distilleries.isEmpty ? nil : "Distillery: " + row.distilleries.joined(separator: ", "),
                     row.finishes.isEmpty ? nil : "Finish: " + row.finishes.joined(separator: ", ")].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// The labelled pairs for accessibility sizes, in the order the row reads; unknown facts are left out.
    static func pairs(_ row: RowModel) -> [(label: String, value: String)] {
        var out: [(label: String, value: String)] = []
        if let glass = row.glass { out.append(("Glass", glass)) }
        out.append(("Proof", row.proof == "—" ? "unknown" : row.proof))
        if row.mashbill != "—" { out.append(("Mashbill", row.mashbill)) }
        if let category = row.category { out.append(("Category", category)) }
        if row.age != "—" { out.append(("Age", row.age)) }
        if !row.distilleries.isEmpty { out.append(("Distillery", row.distilleries.joined(separator: ", "))) }
        if !row.finishes.isEmpty { out.append(("Finish", row.finishes.joined(separator: ", "))) }
        return out
    }
}
