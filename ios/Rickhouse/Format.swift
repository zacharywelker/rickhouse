import Foundation

/// How the server's plain values read on screen.
enum Format {
    /// A price as it is typed: digits and one decimal mark, never more than two places after it. Extra keys are dropped
    /// instead of shown and then refused.
    static func moneyInput(_ typed: String) -> String {
        var out = "", places: Int?
        for ch in typed {
            if ch.isASCII, ch.isNumber {
                if let p = places { if p == 2 { continue }; places = p + 1 }
                out.append(ch)
            } else if (ch == "." || ch == ","), places == nil {
                places = 0
                out.append(ch)
            }
        }
        return out
    }

    /// "2026-10-06" as the reader's short date. Built from parts, not parsed, so the day never shifts with the time zone.
    static func day(_ iso: String) -> String {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return iso }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    /// "Mar 2025" for "2025-03-27", built from parts like `day`; the input when it isn't a date.
    static func monthYear(_ iso: String) -> String {
        guard let value = date(fromISO: iso) else { return iso }
        return value.formatted(.dateTime.month(.abbreviated).year())
    }

    /// "August" for "2026-08-14"; the input when it isn't a date.
    static func monthName(_ iso: String) -> String {
        guard let value = date(fromISO: iso) else { return iso }
        return value.formatted(.dateTime.month(.wide))
    }

    /// The account's currency, set by `Session` when its preferences load. Prices are labelled with it, never converted.
    nonisolated(unsafe) static var currencyCode = "USD"

    static func money(_ amount: String) -> String {
        Double(amount).map { $0.formatted(.currency(code: currencyCode)) } ?? amount
    }

    /// "8.0" as "8" and "7.5" as "7.5"; nil when there is no rating.
    static func rating(_ raw: String?) -> String? {
        raw.flatMap(Double.init).map { "\($0.formatted()) / 10" }
    }

    /// "8.0" as "8" and "7.5" as "7.5", without the "/ 10": the big score on a row. Nil when there is no rating.
    static func score(_ raw: String?) -> String? {
        raw.flatMap(Double.init).map { $0.formatted() }
    }

    /// "2026-10-06" as its month header: "October", or "October 2025" when it isn't this year.
    static func month(_ iso: String, now: Date = Date()) -> String {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count >= 2, let date = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: 1)) else { return iso }
        let sameYear = Calendar.current.component(.year, from: now) == parts[0]
        return date.formatted(sameYear ? .dateTime.month(.wide) : .dateTime.month(.wide).year())
    }

    /// Proof as the label prints it ("131.84 proof"); nil when it isn't a number.
    static func proof(_ raw: String?) -> String? {
        raw.flatMap(Double.init).map { "\($0.formatted()) proof" }
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// A date as the server's "2026-10-06".
    static func isoDay(_ date: Date) -> String { isoDay.string(from: date) }

    /// The server's "2026-10-06" as a date, or nil.
    static func date(fromISO iso: String) -> Date? { isoDay.date(from: String(iso.prefix(10))) }

    /// How a pour from elsewhere reads: "At a bar, The Whiskey Bar". A tasting of your own bottle says nothing unless it
    /// has a place. Nil when there is nothing to say.
    static func pour(source: String?, tastedAt: String?) -> String? {
        let place = tastedAt.flatMap { $0.isEmpty ? nil : $0 }
        let kind = source.flatMap(TastingSource.init(rawValue:))
        guard let kind, kind != .owned else { return place }
        return [kind.title, place].compactMap { $0 }.joined(separator: ", ")
    }

    /// The short phrases that mark a tasting's bottle, most telling first; empty for a standard bottle. Mirrors
    /// `provenanceTags` in `src/lib/provenance.ts`, which the web label page uses: change one, change the other.
    static func provenanceTags(_ provenance: TastingProvenance?) -> [String] {
        guard let p = provenance else { return [] }
        var tags: [String] = []
        if p.privateSelection { tags.append("Private selection") }
        if let name = p.pickName { tags.append("“\(name)”") }
        if let picker = p.pickedBy { tags.append("Picked by \(picker)") }
        if p.singleBarrel { tags.append("Single barrel") }
        if let barrel = p.barrelNumber { tags.append("Barrel \(barrel)") }
        let release = p.release?.trimmingCharacters(in: .whitespaces)
        if let release, !release.isEmpty { tags.append(release) } else if let batch = p.batch { tags.append("Batch \(batch)") }
        if let year = p.releaseYear {
            // The year counts as already shown only as a whole number: "Batch 20240" does not carry 2024.
            let shown = release?.range(of: "(?<![0-9])\(year)(?![0-9])", options: .regularExpression) != nil
            if !shown { tags.append(String(year)) }
        }
        return tags
    }
}
