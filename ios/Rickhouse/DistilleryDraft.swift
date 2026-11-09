import Foundation

/// A new distillery as the phone's "add with details" page holds it (issue #223). The fields and rules are the web's
/// distillery form minus the company, slug and older names, which stay on the web. The server judges every value
/// through the same rules as the web, so this only decides what to show and how to send it.
struct DistilleryDraft: Equatable {
    var name = ""
    var country = "USA"
    var state = ""
    var city = ""
    /// A Scotch region, or "" for none.
    var region = ""
    var dspNumber = ""
    var nomNumber = ""
    /// Digits only; "" for unknown.
    var founded = ""
    var isDefunct = false
    /// "Undisclosed — only a place is given": a bottle that says only "Distilled in Indiana".
    var undisclosed = false
    var notes = ""

    /// The server's list (`SCOTCH_REGIONS`), in its order.
    static let scotchRegions = ScotchRegions.all

    private var countryKey: String { country.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    /// A DSP number only means something in the USA, and a NOM number in Mexico; the server drops each anywhere else,
    /// so the page only asks where it will be kept.
    var showsDSP: Bool { ["us", "usa", "united states", "united states of america"].contains(countryKey) }
    var showsNOM: Bool { ["mx", "mexico", "méxico"].contains(countryKey) }

    /// What a name and a country are enough to save; the server holds the rest to the web's rules.
    var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !countryKey.isEmpty
    }

    /// The JSON the lookups route takes. Always more than a name, so the server uses the web's distillery rules
    /// rather than the name-only shortcut.
    func body() -> [String: Any] {
        let trim = { (text: String) in text.trimmingCharacters(in: .whitespacesAndNewlines) }
        var json: [String: Any] = [
            "name": trim(name),
            "country": trim(country),
            "state": trim(state),
            "city": trim(city),
            "region": region,
            "isDefunct": isDefunct,
            "disclosure": undisclosed ? "undisclosed" : "named",
            "notes": trim(notes),
        ]
        if showsDSP { json["dspNumber"] = trim(dspNumber) }
        if showsNOM { json["nomNumber"] = trim(nomNumber) }
        if let year = Int(founded) { json["founded"] = year }
        return json
    }

    /// How the picker lists it: where it is, as the server lists the others.
    var detail: String? {
        let place = [state, country].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: ", ")
        return place.isEmpty ? nil : place
    }
}
