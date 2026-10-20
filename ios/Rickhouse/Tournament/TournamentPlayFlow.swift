import Foundation

// Mirrors src/lib/tournaments/play-flow.ts: change both together.
// Swift shape: `moveItem` is `RankList.move` and the letter helpers are `GlassMapping`; Ints replace the web's number
// deltas, so a fractional delta cannot arise (any delta other than -1 or 1 is ignored).

/// Move one item of an ordered list (glass letters on the phone's ranking screen, or ids) up or down. Never mutates.
enum RankList {
    static func canMove(count: Int, index: Int, delta: Int) -> Bool {
        abs(delta) == 1 && index >= 0 && index < count && index + delta >= 0 && index + delta < count
    }

    /// The list with the item at `index` swapped with its neighbour; the same list when that runs off either end.
    static func move<T>(_ list: [T], index: Int, delta: Int) -> [T] {
        guard canMove(count: list.count, index: index, delta: delta) else { return list }
        var next = list
        next.swapAt(index, index + delta)
        return next
    }
}

/// Glass letters for a blind flight: A up to F, one per bottle.
enum GlassMapping {
    /// Glass letters a flight can use, from A (the server's set).
    static func letters(_ count: Int) -> [String] { Array(["A", "B", "C", "D", "E", "F"].prefix(max(count, 0))) }

    /// A random order of the first `count` letters (Fisher-Yates). The generator is injectable for tests; the index is taken
    /// as `next() % (i + 1)` so a scripted generator that answers 0 always picks the first slot.
    static func shuffled<G: RandomNumberGenerator>(_ count: Int, using generator: inout G) -> [String] {
        var out = letters(count)
        for i in stride(from: out.count - 1, to: 0, by: -1) {
            out.swapAt(i, Int(generator.next() % UInt64(i + 1)))
        }
        return out
    }

    static func shuffled(_ count: Int) -> [String] {
        var system = SystemRandomNumberGenerator()
        return shuffled(count, using: &system)
    }

    /// Why these letters cannot be saved, or nil: every bottle needs a different letter from A up.
    static func problem(_ glasses: [String?]) -> String? {
        let allowed = Set(letters(glasses.count))
        if glasses.contains(where: { $0 == nil || !allowed.contains($0!) }) {
            return "Give every bottle a letter from \(letters(glasses.count).joined(separator: ", "))."
        }
        if Set(glasses.compactMap { $0 }).count != glasses.count { return "Each bottle needs its own letter." }
        return nil
    }

    static func isComplete(_ glasses: [String?]) -> Bool { problem(glasses) == nil }

    /// Gives the bottle at `index` the letter; if another bottle holds it, that bottle gets the old letter, so the set stays unique.
    static func assign(_ glasses: [String], index: Int, letter: String) -> [String] {
        guard glasses.indices.contains(index) else { return glasses }
        var next = glasses
        if let other = next.firstIndex(of: letter), other != index { next[other] = next[index] }
        next[index] = letter
        return next
    }
}

/// A bottle in the pourer's set-up screen. Names live only in this stage.
struct MappingRow: Equatable {
    let entryId: Int
    let name: String
    let proof: Double?
    let mashbill: String?
    let ageYears: Double?
    var glass: String
}

struct SentGlass: Equatable {
    let entryId: Int
    let glass: String
}

enum Flow: Equatable {
    case start
    case loading
    /// `base` is the letters the server has.
    case mapping(rows: [MappingRow], saved: Bool, base: [String])
    case rank(order: [String])
    case revealed
}

enum FlowAction {
    case show
    case loaded([MappingRow])
    case failed
    case setGlass(entryId: Int, glass: String)
    case setAll([String])
    /// `sent` is the letters that were sent to the server.
    case saved(sent: [SentGlass])
    case hide
    case move(index: Int, delta: Int)
    case recorded
}

enum TournamentPlayFlow {
    static func initialFlow(drawn: Bool) -> Flow { drawn ? .loading : .start }

    /// The mapping with new rows; it counts as saved again when the letters are back to what the server has.
    private static func edited(_ rows: [MappingRow], base: [String]) -> Flow {
        .mapping(rows: rows, saved: zip(rows, base).allSatisfy { $0.glass == $1 } && rows.count == base.count, base: base)
    }

    /// The blind flight's stages. Once `hide` is taken the state holds only letters: the names are dropped, and nothing
    /// but a new `show` (from `start`) can bring them back.
    static func reduce(_ state: Flow, _ action: FlowAction) -> Flow {
        switch (action, state) {
        case (.show, .start):
            return .loading
        case (.loaded(let rows), .loading):
            return .mapping(rows: rows, saved: true, base: rows.map(\.glass))
        case (.failed, .loading):
            return .start
        case (.setGlass(let id, let glass), .mapping(let rows, _, let base)):
            return edited(rows.map { $0.entryId == id ? MappingRow(entryId: $0.entryId, name: $0.name, proof: $0.proof, mashbill: $0.mashbill, ageYears: $0.ageYears, glass: glass) : $0 }, base: base)
        case (.setAll(let letters), .mapping(let rows, _, let base)):
            var next = rows
            for i in next.indices where i < letters.count { next[i].glass = letters[i] }
            return edited(next, base: base)
        case (.saved(let sent), .mapping(let rows, _, _)):
            // The server has what was sent, not what is on screen now: letters changed during the save stay unsaved.
            let byEntry = Dictionary(sent.map { ($0.entryId, $0.glass) }, uniquingKeysWith: { _, last in last })
            let base = rows.map { byEntry[$0.entryId] ?? $0.glass }
            return edited(rows, base: base)
        case (.hide, .mapping(let rows, let saved, _)):
            if !saved || GlassMapping.problem(rows.map(\.glass)) != nil { return state }
            return .rank(order: rows.map(\.glass).sorted())
        case (.move(let index, let delta), .rank(let order)):
            return .rank(order: RankList.move(order, index: index, delta: delta))
        case (.recorded, _):
            return .revealed
        default:
            return state
        }
    }
}
