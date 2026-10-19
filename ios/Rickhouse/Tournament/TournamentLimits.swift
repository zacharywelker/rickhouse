import Foundation

/// The length limits the server enforces on a tournament's text. It counts UTF-16 units (JavaScript's `length`), so an
/// emoji is two; `String.count` would let a longer text through to a 422.
enum TournamentLimits {
    static let name = 80
    static let note = 200
    static let flightName = 80

    static func length(_ text: String) -> Int { text.utf16.count }

    /// `text` cut to at most `limit` UTF-16 units, never in the middle of a character.
    static func clamp(_ text: String, to limit: Int) -> String {
        if length(text) <= limit { return text }
        var out = ""
        var used = 0
        for ch in text {
            let n = ch.utf16.count
            if used + n > limit { break }
            out.append(ch)
            used += n
        }
        return out
    }
}
