import Foundation

struct User: Decodable, Equatable {
    let id: Int
    let name: String
    let username: String
}

struct MeResponse: Decodable { let user: User }

/// A currency the account may pick. Display only: the server never converts amounts.
struct CurrencyOption: Decodable, Identifiable, Equatable {
    let code: String
    let name: String
    let symbol: String
    let decimals: Int
    var id: String { code }
}

struct PreferencesAnswer: Decodable {
    let currency: String
    let currencies: [CurrencyOption]
}

/// Numeric columns (proof, price, rating) arrive as strings, exactly as Postgres holds them.
struct BottleSummary: Decodable, Identifiable, Hashable {
    let id: Int
    /// The label's id; absent from an older server's answer.
    let expressionId: Int?
    let brand: String
    let name: String
    let category: String
    let status: String
    let isOpen: Bool
    let isFavorite: Bool
    let fillPct: Int
    let proof: String?
    let ageStatement: String?
    let pricePaid: String?
    let store: String?
    let thumbPath: String?
    /// Whether the photo is a cut-out (transparent around the bottle). Nil from an
    /// older server, or for a photo the server hasn't checked yet; the card treats
    /// nil as a cut-out, as it drew every photo before the flag existed.
    let thumbIsCutout: Bool?
}

struct BottlePage: Decodable {
    let page: Int
    let pageCount: Int
    let total: Int
    let bottles: [BottleSummary]
}

struct BottleDetail: Decodable {
    let id: Int
    /// The label's id and flavor wheel; absent from an older server's answer.
    let expressionId: Int?
    let wheel: String?
    let brand: String
    let name: String
    let category: String
    var status: String
    var isOpen: Bool
    let isFavorite: Bool
    /// Set while the bottle is muted from What to drink tonight (a date in the future); absent from an older server.
    var mutedUntil: String?
    var fillPct: Int
    let proof: String?
    let ageStatement: String?
    let sizeMl: Int
    let msrp: String?
    let pricePaid: String?
    let store: String?
    let storeId: Int?
    let releaseId: Int?
    let dateAcquired: String?
    var dateOpened: String?
    let batch: String?
    let releaseYear: Int?
    let barrelNumber: String?
    let pickName: String?
    let location: String?
    let notes: String?
    let distilleries: [String]
    let finishes: [String]
    let mashbills: [String]
    let images: [BottleImage]
    var tastingNotes: [TastingNote]
    /// Single barrel, and a private select of one; absent from an older server's answer.
    let isSingleBarrel: Bool?
    let isSingleBarrelPick: Bool?
}

/// What the server changed besides the level when one is set.
struct FillResult: Decodable {
    let fillPct: Int
    let isOpen: Bool
    let status: String
    let dateOpened: String?
}

struct BottleImage: Decodable, Identifiable {
    let id: Int
    let path: String
    let thumbPath: String?
    let isPrimary: Bool
}

struct TastingNote: Decodable, Identifiable, Equatable {
    let id: Int
    /// The next three are absent from an older server's answer.
    let source: String?
    let tastedAt: String?
    let tags: [String]?
    let tastedOn: String
    let rating: String?
    let nose: String?
    let palate: String?
    let finish: String?
    let overall: String?
}

struct LabelOption: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let brand: String
    let category: String
    let proof: String?
    /// Absent from an older server's answer.
    let upc: String?
    let thumbPath: String?
    /// The flavor wheel its category uses ("bourbon", "rum"…), or nil where the family has none or the server is older.
    let wheel: String?

    var title: String { "\(brand) \(name)" }
}

struct LabelsResponse: Decodable { let expressions: [LabelOption] }

/// One row of the tasting history: a note, with the label and bottle it belongs to.
struct TastingEntry: Decodable, Identifiable {
    let id: Int
    /// Nil for a pour of a bottle you don't own.
    let bottleId: Int?
    let expressionId: Int
    let brand: String
    let name: String
    let category: String
    /// The next three are absent from an older server's answer.
    let source: String?
    let tastedAt: String?
    let tags: [String]?
    let tastedOn: String
    let rating: String?
    let nose: String?
    let palate: String?
    let finish: String?
    let overall: String?
    let thumbPath: String?

    var title: String { "\(brand) \(name)" }

    /// The first line worth showing: the overall impression, else whatever was written.
    var summary: String? {
        [overall, nose, palate, finish].compactMap { $0 }.first { !$0.isEmpty }
    }
}

struct TastingsPage: Decodable {
    let page: Int
    let pageCount: Int
    let total: Int
    let tastings: [TastingEntry]
}

/// A label read on its own page: specs, releases, the bottles you have of it and the tastings on them.
struct LabelDetail: Decodable {
    let id: Int
    let wheel: String?
    let brandId: Int?
    let categoryId: Int?
    let brand: String
    let name: String
    let category: String
    let upc: String?
    let proof: String?
    let ageStatement: String?
    let ageYears: String?
    let sizeMl: Int
    let msrp: String?
    let photoPath: String?
    let photoThumbPath: String?
    let distilleries: [String]
    let finishes: [String]
    let mashbills: [String]
    let releases: [LabelRelease]
    let bottles: [LabelBottle]
    let tastings: [LabelTasting]
    /// The distillery, mashbill and finish lists with ids and shares, for editing them. Absent from an older server.
    let links: LabelLinks?
}

struct LabelRelease: Decodable, Identifiable {
    let id: Int
    let name: String
    let releaseYear: Int?
    let proof: String?
    let ageStatement: String?
    let msrp: String?
    let photoThumbPath: String?
}

struct LabelBottle: Decodable, Identifiable, Hashable {
    let id: Int
    let status: String
    let isOpen: Bool
    let fillPct: Int
    let release: String?
    let releaseYear: Int?
    let pickName: String?
    let barrelNumber: String?
    let pricePaid: String?
    let dateAcquired: String?
    let store: String?
    let thumbPath: String?
}

struct LabelTasting: Decodable, Identifiable {
    let id: Int
    /// Nil for a pour of a bottle you don't own.
    let bottleId: Int?
    let source: String?
    let tastedAt: String?
    let tags: [String]?
    let tastedOn: String
    let rating: String?
    let nose: String?
    let palate: String?
    let finish: String?
    let overall: String?
}

/// A 409 from creating a label: the label that is already there.
struct DuplicateAnswer: Decodable { let existing: LabelOption? }

struct CategoryOption: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    /// The group it sits in ("American Whiskey"), or nil for a top-level one.
    let parent: String?
}

struct CategoriesResponse: Decodable { let categories: [CategoryOption] }

/// What the phone sends to start a label; the rest is filled in on the web.
struct NewLabel: Encodable {
    var brand: String
    var name: String
    var categoryId: Int
    var upc: String?
}

/// Barcodes as the server stores and matches them.
enum Barcode {
    /// Digits only, or nil when it can't be a barcode (6 to 32 digits).
    static func normalise(_ raw: String) -> String? {
        let digits = raw.filter { !$0.isWhitespace && $0 != "-" }
        guard (6...32).contains(digits.count), digits.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        return digits
    }

    /// The forms a code may be saved under: a UPC-A is the same product as its EAN-13 with a leading zero.
    static func forms(of digits: String) -> Set<String> {
        var forms: Set = [digits]
        if digits.count == 13, digits.hasPrefix("0") { forms.insert(String(digits.dropFirst())) }
        if digits.count == 12 { forms.insert("0" + digits) }
        return forms
    }
}

struct NewBottle: Encodable {
    var expressionId: Int
    var pricePaid: String?
    var dateAcquired: String?
    var batch: String?
    var location: String?
    var notes: String?
}

struct CreatedBottle: Decodable { let id: Int }


extension LabelBottle {
    /// What tells one bottle of a label from another, in a few words.
    var title: String {
        let parts = [
            pickName.map { "“\($0)”" },
            barrelNumber.map { "barrel \($0)" },
            release,
            releaseYear.map(String.init),
        ].compactMap { $0 }
        return parts.isEmpty ? "Standard release" : parts.joined(separator: ", ")
    }
}

/// Where a tasting happened. A bottle of your own is "owned"; the rest are pours from elsewhere.
enum TastingSource: String, CaseIterable, Identifiable {
    case owned, bar, bottleShare = "bottle_share", sample, storePour = "store_pour"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .owned: "Owned"
        case .bar: "At a bar"
        case .bottleShare: "Bottle share"
        case .sample: "Sample"
        case .storePour: "Store pour"
        }
    }

    /// The sources to offer when the tasting is not on one of your bottles.
    static let elsewhere: [TastingSource] = [.bar, .bottleShare, .sample, .storePour]
}

/// A tasting as the server takes it. `expressionId` and `bottleId` are sent when logging a new one and left out when
/// editing; anything else left out is cleared.
struct TastingBody: Encodable {
    var expressionId: Int?
    var bottleId: Int?
    var source: String
    var tastedAt: String?
    var tastedOn: String
    var rating: Double?
    var tags: [String]
    var nose: String?
    var palate: String?
    var finish: String?
    var overall: String?
}

struct CreatedTasting: Decodable { let id: Int }

/// A flavor wheel: categories, then subcategories, then the descriptors a tasting stores by `key`.
struct TastingWheel: Decodable, Identifiable {
    let id: String
    let name: String
    /// The credit line for the wheel's owner, shown wherever it is used.
    let credit: String
    let categories: [WheelCategory]
}

struct WheelCategory: Decodable, Identifiable {
    let name: String
    let groups: [WheelGroup]
    var id: String { name }

    var descriptors: [WheelDescriptor] { groups.flatMap(\.descriptors) }
}

/// A subcategory; `name` is nil on a wheel with no middle ring.
struct WheelGroup: Decodable, Identifiable {
    let name: String?
    let descriptors: [WheelDescriptor]
    var id: String { name ?? "" }
}

struct WheelDescriptor: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    var id: String { key }
}

struct WheelsResponse: Decodable { let wheels: [TastingWheel] }

extension LabelTasting {
    /// A note on a bottle's page, as the tasting form takes one to edit.
    init(_ note: TastingNote, bottleId: Int) {
        self.init(
            id: note.id, bottleId: bottleId, source: note.source, tastedAt: note.tastedAt, tags: note.tags,
            tastedOn: note.tastedOn, rating: note.rating, nose: note.nose, palate: note.palate,
            finish: note.finish, overall: note.overall
        )
    }
}

/// One row of a label's ordered distillery, mashbill or finish list, as the server reads and writes it.
struct LinkRow: Decodable, Equatable, Identifiable {
    let id: Int
    let name: String
    /// A share (distilleries, mashbills) or months (finishes); nil when none is recorded.
    var amount: Double?
    /// Mashbills only: which of the label's distilleries made this recipe.
    var distilleryId: Int?
    /// Distilleries only: identified from outside the label.
    var inferred: Bool?

    init(id: Int, name: String, amount: Double? = nil, distilleryId: Int? = nil, inferred: Bool? = nil) {
        self.id = id; self.name = name; self.amount = amount; self.distilleryId = distilleryId; self.inferred = inferred
    }
}

struct LabelLinks: Decodable, Equatable {
    var distilleries: [LinkRow]
    var mashbills: [LinkRow]
    var finishes: [LinkRow]
}

/// A list the pickers draw from: your own names for one kind of thing.
enum LookupKind: String {
    case brands, distilleries, mashbills, finishes, stores

    var singular: String {
        switch self {
        case .brands: "brand"
        case .distilleries: "distillery"
        case .mashbills: "mashbill"
        case .finishes: "finish"
        case .stores: "store"
        }
    }

    /// A name is enough to make these; a mashbill is a recipe and a store has a place, so they are made on the web.
    var creatable: Bool { self == .brands || self == .distilleries || self == .finishes }
}

struct LookupItem: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    /// A place, where there is one.
    let detail: String?

    init(id: Int, name: String, detail: String? = nil) { self.id = id; self.name = name; self.detail = detail }
}

struct LookupsResponse: Decodable { let items: [LookupItem] }
struct CreatedLookup: Decodable { let id: Int; let name: String; let created: Bool }
