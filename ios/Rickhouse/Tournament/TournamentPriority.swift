import Foundation

// Mirrors src/lib/tournaments/priority.ts (and GROUP_KEYS / isGroupOrder from types.ts): change both together.

enum TournamentPriority {
    /// The five things flights can be matched on, in the engine's default order: proof first, since bottles at different
    /// strengths are not a fair taste.
    static let keys = ["proof", "mashbill", "distillery", "age", "finish"]
    static let defaultOrder = keys

    /// What each grouping key is called on the page.
    static let labels = ["proof": "Proof", "mashbill": "Mashbill", "distillery": "Distillery", "age": "Age", "finish": "Finish"]

    /// One line under each key, so the order can be chosen without knowing how the engine compares.
    static let help = [
        "proof": "In bands of 5, so 100 and 101 count as the same strength.",
        "mashbill": "Matching recipes or styles together.",
        "distillery": "Bottles from the same distillery together.",
        "age": "Similar stated ages together.",
        "finish": "The same finish together.",
    ]

    /// True when `order` holds each of the five keys exactly once.
    static func isGroupOrder(_ order: [String]) -> Bool {
        order.count == keys.count && Set(order) == Set(keys)
    }

    /// A copy of `order` with the key at `index` moved by `delta` places; unchanged when that would leave the list.
    /// (Ints cannot be fractional or NaN, so the web's non-integer cases do not arise.)
    static func moveKey(_ order: [String], _ index: Int, _ delta: Int) -> [String] {
        var next = order
        let to = index + delta
        guard next.indices.contains(index), next.indices.contains(to) else { return next }
        next.insert(next.remove(at: index), at: to)
        return next
    }
}
