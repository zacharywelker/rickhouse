import Foundation

/// What the label page says about your tastings of a label: the average and range of the scored ones, the points for
/// the score line, and the flavors you note most. Unscored tastings count as tastings but not toward any score.
struct LabelScores {
    /// The chart and the flavor bars appear from this many tastings; below it they say less than the rows.
    static let chartMinimum = 3

    struct Point: Identifiable {
        let id: Int
        let date: Date
        let rating: Double
    }

    struct Flavor: Equatable {
        let key: String
        let count: Int
    }

    let count: Int
    let average: Double?
    let low: Double?
    let high: Double?
    /// Scored tastings, oldest first.
    let points: [Point]
    /// Most noted first; a tie keeps the order the flavor was first noted in, newest tasting first.
    let flavors: [Flavor]

    init(_ tastings: [LabelTasting], flavorLimit: Int = 5) {
        count = tastings.count
        let scored = tastings.compactMap { t in t.rating.flatMap(Double.init).map { (t, $0) } }
        let ratings = scored.map(\.1)
        average = ratings.isEmpty ? nil : (ratings.reduce(0, +) / Double(ratings.count) * 10).rounded() / 10
        low = ratings.min()
        high = ratings.max()
        points = scored
            .compactMap { t, rating in Format.date(fromISO: t.tastedOn).map { Point(id: t.id, date: $0, rating: rating) } }
            .sorted { ($0.date, $0.id) < ($1.date, $1.id) }

        var counts: [String: Int] = [:]
        var order: [String] = []
        for key in tastings.flatMap({ $0.tags ?? [] }) {
            if counts[key] == nil { order.append(key) }
            counts[key, default: 0] += 1
        }
        flavors = order.enumerated()
            .sorted { (counts[$0.element]!, -$0.offset) > (counts[$1.element]!, -$1.offset) }
            .prefix(flavorLimit)
            .map { Flavor(key: $0.element, count: counts[$0.element]!) }
    }

    /// Enough tastings for the line and the flavor bars.
    var showsTrend: Bool { count >= Self.chartMinimum && points.count >= 2 }

    /// "average of 7 · range 7 to 9", or "average of 2" when the range adds nothing.
    var caption: String {
        let scored = points.count
        var text = "average of \(scored)"
        if let low, let high, low != high { text += " · range \(low.formatted()) to \(high.formatted())" }
        return text
    }
}
