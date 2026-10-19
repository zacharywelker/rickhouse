import Foundation

// Mirrors the parts of src/lib/tournaments/rounds.ts the screens use: change both together.

/// One entry's place in a decided flight; `place` is nil for a bye.
struct Placing: Equatable {
    let entryId: Int
    let place: Int?
}

enum TournamentRounds {
    struct InvalidPlan: Error, Equatable {}

    /// How many of a flight of `size` go through: a 4-way advances 2, a 3-way or 2-way advances 1, a bye advances its one.
    static func advanceCount(_ size: Int) -> Int {
        size <= 1 ? 1 : max(1, size / 2)
    }

    /// The entry ids that go through from one decided flight, best placed first.
    static func advancers(_ entries: [Placing], bye: Bool) -> [Int] {
        if bye { return entries.map(\.entryId) }
        // Offsets keep equal places in their given order, as the web's stable sort does.
        let ranked = entries.enumerated().sorted {
            let (a, b) = ($0.element.place ?? .max, $1.element.place ?? .max)
            return a != b ? a < b : $0.offset < $1.offset
        }.map(\.element)
        return ranked.prefix(advanceCount(entries.count)).map(\.entryId)
    }

    /// How many flights each round has, from the field's size to the final (no withdrawals). 12 bottles of 4: [3, 2, 1].
    static func planRounds(entrantCount: Int, heatSize: Int) throws -> [Int] {
        guard heatSize >= 2, entrantCount >= 2 else { throw InvalidPlan() }
        var rounds: [Int] = []
        var pool = entrantCount
        while true {
            rounds.append((pool + heatSize - 1) / heatSize)
            if pool <= heatSize { return rounds }
            var next = 0
            var left = pool
            while left > 0 { next += advanceCount(min(heatSize, left)); left -= heatSize }
            pool = next
        }
    }
}
