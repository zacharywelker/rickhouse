import Foundation

// No web twin (spec section 4, "Phone zoom"). Three layouts, not scaled text: the level picks which fields a row shows
// and whether bottles are drawn at all; type sizes stay with Dynamic Type.

enum ZoomLevel: Int, CaseIterable, Equatable {
    case detail = 0, compact = 1, map = 2

    /// The "+" button: toward more detail, clamped at `detail`.
    var zoomedIn: ZoomLevel { ZoomLevel(rawValue: rawValue - 1) ?? .detail }
    /// The "−" button: toward the map, clamped at `map`.
    var zoomedOut: ZoomLevel { ZoomLevel(rawValue: rawValue + 1) ?? .map }
    var canZoomIn: Bool { self != .detail }
    var canZoomOut: Bool { self != .map }

    enum RowField: Equatable { case place, name, proof, mashbill, age }

    /// What one bottle row shows at this level. The map draws no bottles.
    var rowFields: [RowField] {
        switch self {
        case .detail: [.name, .proof, .mashbill, .age]
        case .compact: [.place, .name, .proof]
        case .map: []
        }
    }
}

/// Where the level is remembered; a protocol so tests do not touch the real defaults.
protocol ZoomStore {
    func level(forTournament id: Int) -> ZoomLevel
    func set(_ level: ZoomLevel, forTournament id: Int)
}

/// The level per tournament on this device, not on the server.
struct UserDefaultsZoomStore: ZoomStore {
    var defaults: UserDefaults = .standard

    static func key(_ id: Int) -> String { "tournament.zoom.\(id)" }

    func level(forTournament id: Int) -> ZoomLevel {
        ZoomLevel(rawValue: defaults.integer(forKey: Self.key(id))) ?? .detail
    }

    func set(_ level: ZoomLevel, forTournament id: Int) {
        defaults.set(level.rawValue, forKey: Self.key(id))
    }
}
