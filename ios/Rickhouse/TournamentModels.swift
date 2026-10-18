import Foundation

// The tournaments API's shapes, field for field (src/lib/tournaments/{view,heats,ranking-query,queries,field}.ts).
// Numbers here are JSON numbers, unlike a bottle's numerics, which arrive as Strings.

enum TournamentStatus: String, Decodable { case draft, active, complete }
enum HeatStatus: String, Decodable { case pending, decided, bye }
enum EntryStatus: String, Decodable { case active, withdrawn }
enum EntryKind: String, Decodable { case bottle, label, adhoc }
enum Seeding: String, Codable { case similar, random }

/// One row of the list: enough to draw a progress bar.
struct TournamentSummary: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let status: TournamentStatus
    let heatSize: Int
    let blind: Bool
    let entryCount: Int
    /// The round being played, nil before the first.
    let currentRound: Int?
    /// Rounds there will be if nobody withdraws; 0 under two entries.
    let totalRounds: Int
    let progress: Progress
    let createdAt: String
    let completedAt: String?

    struct Progress: Decodable, Equatable { let done: Int; let total: Int }
}

struct TournamentList: Decodable { let tournaments: [TournamentSummary] }

struct TournamentEntry: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let status: EntryStatus
    let kind: EntryKind
    let bottleId: Int?
    let expressionId: Int?
}

/// An entry as one flight shows it.
struct HeatEntry: Decodable, Identifiable, Equatable {
    let entryId: Int
    let name: String
    let place: Int?
    let glass: String?
    let proof: Double?
    /// Display string, ready to show ("60% corn, 36% rye, 4% barley").
    let mashbill: String?
    let ageYears: Double?
    let distilleries: [String]

    var id: Int { entryId }
}

struct TournamentHeat: Decodable, Identifiable, Equatable {
    let id: Int
    let round: Int
    let slot: Int
    let status: HeatStatus
    /// The owner's own name for the flight; nil for a hidden one.
    let label: String?
    /// What the flight's bottles share; nil while a blind flight is hidden.
    let autoLabel: String?
    /// "90 to 94 proof"; empty when a proof is unknown. Shown even for a hidden flight.
    let band: String
    /// A pending flight of a running blind tournament: no names, facts or entry ids, only `band`, `entryCount`, `glasses`.
    let hidden: Bool
    let entryCount: Int
    let glasses: [String]
    let entries: [HeatEntry]

    var displayLabel: String? { label ?? autoLabel }
}

struct TournamentRound: Decodable, Identifiable, Equatable {
    let round: Int
    let heats: [TournamentHeat]
    var id: Int { round }
}

struct TournamentStanding: Decodable, Identifiable, Equatable {
    let entryId: Int
    let name: String
    let rank: Int
    let round: Int
    let place: Int?
    var id: Int { entryId }
}

struct TournamentChampion: Decodable, Equatable { let entryId: Int; let name: String }

struct TournamentView: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let status: TournamentStatus
    let heatSize: Int
    let seeding: Seeding
    let groupOrder: [String]
    let blind: Bool
    let fieldNote: String?
    let createdAt: String
    let startedAt: String?
    let completedAt: String?
    let entries: [TournamentEntry]
    let rounds: [TournamentRound]
    /// Flights per round from the field's size to the final, assuming no one withdraws. Empty under two entrants.
    let plan: [Int]
    let currentRound: Int?
    let progress: TournamentSummary.Progress
    let standings: [TournamentStanding]
    let champion: TournamentChampion?
}

/// A flight as the pourer sees it: every glass with what is in it.
struct DrawnHeat: Decodable, Identifiable, Equatable {
    let heatId: Int
    let round: Int
    let slot: Int
    let band: String
    let glasses: [Glass]

    var id: Int { heatId }

    struct Glass: Decodable, Identifiable, Equatable {
        let glass: String
        let entry: Entry
        var id: String { glass }
    }

    /// `ViewHeatEntry` minus place and glass.
    struct Entry: Decodable, Equatable {
        let entryId: Int
        let name: String
        let proof: Double?
        let mashbill: String?
        let ageYears: Double?
        let distilleries: [String]
    }
}

/// The long-term ranking. Competitors in different `group`s cannot be compared.
struct RankingResult: Decodable, Equatable {
    let competitors: [Competitor]
    let audit: [AuditRow]

    struct Competitor: Decodable, Identifiable, Equatable {
        /// "b:<bottleId>" or "e:<expressionId>".
        let id: String
        let name: String
        let bottleId: Int?
        let expressionId: Int?
        let rating: Double?
        let theta: Double
        let rank: Int
        let heats: Int
        let provisional: Bool
        let singleBand: Bool
        let group: Int
        let groupSize: Int
    }

    /// Where the ranking and the 0 to 10 ratings disagree; `gap` is rank minus expectedRank (positive: ranks worse than rated).
    struct AuditRow: Decodable, Identifiable, Equatable {
        let id: String
        let name: String
        let rating: Double
        let rank: Int
        let groupSize: Int
        let expectedRank: Int
        let gap: Int
    }
}

/// One of your bottles in the field picker. `name` is what an entry made from it is called.
struct FieldCandidate: Decodable, Identifiable, Equatable {
    let bottleId: Int
    let expressionId: Int
    let name: String
    let category: String
    let categoryId: Int
    let proof: Double?
    let status: String
    let isOpen: Bool
    let tastings: Int
    let avgRating: Double?

    var id: Int { bottleId }
}

struct FieldPage: Decodable, Equatable {
    let rows: [FieldCandidate]
    let total: Int
}

/// One of your labels, for an entry with no bottle.
struct LabelCandidate: Decodable, Identifiable, Equatable {
    let expressionId: Int
    let name: String
    let category: String
    let proof: Double?

    var id: Int { expressionId }
}

struct LabelCandidates: Decodable { let rows: [LabelCandidate] }

// MARK: Request bodies

/// An entry going into a field: a bottle, a label with no bottle, or an outside name.
enum EntryInput: Encodable, Equatable {
    case bottle(Int)
    case label(Int)
    case outside(String)

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        switch self {
        case .bottle(let id): try c.encode(id, forKey: .bottleId)
        case .label(let id): try c.encode(id, forKey: .expressionId)
        case .outside(let name): try c.encode(name, forKey: .name)
        }
    }

    private enum Key: String, CodingKey { case bottleId, expressionId, name }
}

/// `POST /tournaments`. Optional settings left nil take the server's defaults.
struct NewTournament: Encodable, Equatable {
    var name: String
    var heatSize: Int
    var seeding: Seeding?
    var groupOrder: [String]?
    var blind: Bool?
    var fieldNote: String?
    var entries: [EntryInput]
}

/// `PATCH /tournaments/:id`: only what is set is sent. A draft takes anything; a running tournament only `groupOrder` and `seeding`.
/// `fieldNote` is double-optional so an explicit `nil` can be told apart from "unchanged" and sent as JSON null.
struct TournamentPatch: Equatable {
    var name: String?
    var heatSize: Int?
    var seeding: Seeding?
    var groupOrder: [String]?
    var blind: Bool?
    var fieldNote: String??
    var entries: [EntryInput]?

    var json: [String: Any] {
        var out: [String: Any] = [:]
        if let name { out["name"] = name }
        if let heatSize { out["heatSize"] = heatSize }
        if let seeding { out["seeding"] = seeding.rawValue }
        if let groupOrder { out["groupOrder"] = groupOrder }
        if let blind { out["blind"] = blind }
        if let note = fieldNote { out["fieldNote"] = note.map { $0 as Any } ?? NSNull() }
        if let entries { out["entries"] = entries.map(\.json) }
        return out
    }
}

extension EntryInput {
    var json: [String: Any] {
        switch self {
        case .bottle(let id): ["bottleId": id]
        case .label(let id): ["expressionId": id]
        case .outside(let name): ["name": name]
        }
    }
}

/// The picker's filters, as the field endpoint takes them. `statuses` nil leaves the server's default (owned and open);
/// an empty set means every status.
struct FieldFilters: Equatable {
    enum Opened: String { case any, open, sealed }
    enum Tasted: String { case any, tasted, untasted }

    var q = ""
    var categoryIds: Set<Int> = []
    var statuses: Set<String>?
    var opened = Opened.any
    var tasted = Tasted.any

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        let words = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if !words.isEmpty { items.append(.init(name: "q", value: words)) }
        if !categoryIds.isEmpty { items.append(.init(name: "categoryIds", value: categoryIds.sorted().map(String.init).joined(separator: ","))) }
        if let statuses { items.append(.init(name: "statuses", value: statuses.isEmpty ? "all" : statuses.sorted().joined(separator: ","))) }
        if opened != .any { items.append(.init(name: "opened", value: opened.rawValue)) }
        if tasted != .any { items.append(.init(name: "tasted", value: tasted.rawValue)) }
        return items
    }
}
