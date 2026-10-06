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
    /// Absent from an older server's answer.
    let upc: String?
    let thumbPath: String?

    var title: String { "\(brand) \(name)" }
}

struct LabelsResponse: Decodable { let expressions: [LabelOption] }

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

/// A tasting note as the server takes it. Left out, a field is cleared, so an edit sends all of them.
struct NoteBody: Encodable {
    var tastedOn: String
    var rating: Double?
    var nose: String?
    var palate: String?
    var finish: String?
    var overall: String?
}
