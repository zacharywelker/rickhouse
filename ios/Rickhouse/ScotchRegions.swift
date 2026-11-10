import Foundation

/// A Scotch label's regions (issue #223), held in the draft as the web form's comma text ("Islay, Speyside") and sent as a
/// list. The server takes only these six, once each, in the order given, so toggling keeps what was already there first.
enum ScotchRegions {
    /// The server's list (`SCOTCH_REGIONS`), in its order.
    static let all = ["Speyside", "Highland", "Lowland", "Islay", "Campbeltown", "Islands"]

    /// The regions in comma text, in the order given, once each and spelled as the server spells them when they are known.
    static func list(_ text: String) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for part in text.split(separator: ",") {
            let name = part.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty { continue }
            let spelled = all.first { $0.caseInsensitiveCompare(name) == .orderedSame } ?? name
            if seen.insert(spelled.lowercased()).inserted { result.append(spelled) }
        }
        return result
    }

    static func text(_ regions: [String]) -> String { regions.joined(separator: ", ") }

    /// The text with these regions added after those already there, each once and in the server's spelling.
    static func adding(_ more: [String], to text: String) -> String {
        Self.text(list((list(text) + more).joined(separator: ", ")))
    }

    /// The text with `region` added at the end, or taken out if it was there.
    static func toggled(_ region: String, in text: String) -> String {
        var regions = list(text)
        if let at = regions.firstIndex(where: { $0.caseInsensitiveCompare(region) == .orderedSame }) { regions.remove(at: at) } else { regions.append(region) }
        return Self.text(regions)
    }
}
