import Foundation

struct User: Decodable, Equatable {
    let id: Int
    let name: String
    let username: String
}

struct MeResponse: Decodable { let user: User }

/// Numeric columns (proof, price, rating) arrive as strings, exactly as Postgres holds them.
struct BottleSummary: Decodable, Identifiable, Hashable {
    let id: Int
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
}

struct BottlePage: Decodable {
    let page: Int
    let pageCount: Int
    let total: Int
    let bottles: [BottleSummary]
}

struct BottleDetail: Decodable {
    let id: Int
    let brand: String
    let name: String
    let category: String
    var status: String
    var isOpen: Bool
    let isFavorite: Bool
    var fillPct: Int
    let proof: String?
    let ageStatement: String?
    let sizeMl: Int
    let msrp: String?
    let pricePaid: String?
    let store: String?
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
    let thumbPath: String?

    var title: String { "\(brand) \(name)" }
}

struct LabelsResponse: Decodable { let expressions: [LabelOption] }

struct NewBottle: Encodable {
    var expressionId: Int
    var pricePaid: String?
    var dateAcquired: String?
    var batch: String?
    var location: String?
    var notes: String?
}

struct CreatedBottle: Decodable { let id: Int }

/// A tasting note as the server takes it. Left out, a field is cleared, so an edit sends all of them.
struct NoteBody: Encodable {
    var tastedOn: String
    var rating: Double?
    var nose: String?
    var palate: String?
    var finish: String?
    var overall: String?
}
