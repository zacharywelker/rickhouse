import Foundation

// What to drink tonight and Roulette, as the server's `/api/v1/tonight` routes send them (design:
// docs/superpowers/specs/2026-10-08-tonight-design.md). The rules (weights, gating, bands) live on the server.

/// What each step shows for the choices so far.
struct TonightOptions: Decodable, Equatable {
    struct Spirit: Decodable, Identifiable, Equatable {
        let categoryId: Int
        let name: String
        let open: Int
        let sealed: Int
        let muted: Int
        let tastings: Int
        /// Its flavors can be offered: it has a wheel and enough tastings.
        let flavors: Bool
        var id: Int { categoryId }
    }

    struct Band: Decodable, Identifiable, Equatable {
        let key: String
        let label: String
        let range: String
        let count: Int
        var id: String { key }
    }

    struct Proof: Decodable, Equatable {
        let applies: Bool
        let lo: Double?
        let hi: Double?
        let bands: [Band]
    }

    struct Flavor: Decodable, Identifiable, Equatable {
        let key: String
        let label: String
        let count: Int
        var id: String { key }
    }

    struct Skipped: Decodable, Identifiable, Equatable {
        let categoryId: Int
        let name: String
        let tastings: Int
        var id: Int { categoryId }
    }

    struct Flavors: Decodable, Equatable {
        let enabled: Bool
        let tags: [Flavor]
        /// Chosen spirits left out of the list for too few tastings or no wheel.
        let skipped: [Skipped]
    }

    /// "Time to open a new bottle?": what to offer when flavors are off.
    struct Fallback: Decodable, Equatable {
        let tastings: Int
        let spirits: [String]
        let open: Int
        let sealed: Int
    }

    struct Limits: Decodable, Equatable {
        let minSpiritTastings: Int
        let minTotalTastings: Int
    }

    let limits: Limits
    let spirits: [Spirit]
    let proof: Proof
    let flavors: Flavors
    let fallback: Fallback?
}

/// One draw. `mode` is the steps' choices ("flow") or Roulette; `only` is the fallback's two buttons.
struct TonightPickRequest: Encodable, Equatable {
    var mode: String
    var only: String?
    var categories: [Int]
    var sealed: Bool
    var bands: [String]
    var flavors: [String]
    var exclude: [Int]

    static let flow = "flow"
    static let roulette = "roulette"
}

struct TonightPick: Decodable, Equatable {
    struct Bottle: Decodable, Equatable, Identifiable {
        struct LastTasted: Decodable, Equatable {
            let on: String
            let rating: Double?
            let daysAgo: Int
        }

        let id: Int
        let expressionId: Int
        let brand: String
        let name: String
        let categoryId: Int
        let category: String
        let sealed: Bool
        let fillPct: Int
        let proof: Double?
        let dateAcquired: String?
        let thumbPath: String?
        let lastTasted: LastTasted?

        var title: String { name.lowercased().hasPrefix(brand.lowercased()) ? name : "\(brand) \(name)" }
    }

    let bottle: Bottle
    /// Why it came up, in plain sentences.
    let why: [String]
    /// How many more bottles could still be drawn after this one.
    let left: Int
}

struct TonightPickResponse: Decodable {
    let pick: TonightPick?
}

// MARK: Mutes

/// A bottle held out of every pick until a date.
struct MutedBottle: Decodable, Identifiable, Equatable {
    let bottleId: Int
    let brand: String
    let name: String
    let category: String
    /// "2026-10-14".
    let mutedUntil: String
    var id: Int { bottleId }

    var title: String { name.lowercased().hasPrefix(brand.lowercased()) ? name : "\(brand) \(name)" }
}

/// The lengths a mute may have, as end dates in the server's calendar.
struct MutePreset: Decodable, Identifiable, Equatable {
    let key: String
    let label: String
    let until: String
    var id: String { key }
}

struct MuteWindow: Decodable, Equatable {
    let min: String
    let max: String
}

struct MutesResponse: Decodable {
    let mutes: [MutedBottle]
    let window: MuteWindow
    let presets: [MutePreset]
}

struct MuteAnswer: Decodable {
    let id: Int
    let mutedUntil: String?
}
