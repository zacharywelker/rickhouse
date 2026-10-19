import SwiftUI

/// One comparable group of the ranking. Groups never merge: each is its own labelled section with its own note.
struct RankingSectionView: View {
    let section: RankingSection

    var body: some View {
        Section {
            ForEach(section.rows) { row in
                if let id = row.expressionId {
                    NavigationLink { LabelPage(id: id) } label: { RankingRowView(row: row) }
                } else {
                    RankingRowView(row: row)
                }
            }
        } header: {
            if let title = section.title {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(title) · \(section.size) ranked").font(.inter(14, .semibold)).foregroundStyle(Theme.ink)
                    if let note = section.note { Text(note).font(.inter(13)).foregroundStyle(Theme.muted).textCase(nil) }
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
            }
        }
    }
}

/// Rank, name, then the facts. At accessibility sizes the rank stacks over the name, as everywhere else.
struct RankingRowView: View {
    let row: RankingRow
    @Environment(\.dynamicTypeSize) private var typeSize

    private var facts: String {
        "\(row.heats) \(row.heats == 1 ? "flight" : "flights")" + (row.rating.map { " · Rated \($0)" } ?? "")
    }

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
        layout {
            Text(row.rankText).font(.inter(16, .semibold)).monospacedDigit().foregroundStyle(Theme.ink)
                .frame(minWidth: typeSize.isAccessibilitySize ? 0 : 48, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text(row.name).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                Text(facts).font(.inter(14)).monospacedDigit().foregroundStyle(Theme.muted)
                if !row.tags.isEmpty {
                    HStack(spacing: 6) { ForEach(row.tags, id: \.self) { TagChip(text: $0) } }
                }
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(row.rankText), \(row.name), \(facts)" + (row.tags.isEmpty ? "" : ", " + row.tags.joined(separator: ", ")))
    }
}

/// "Provisional" or "Single band": words in a box, never colour alone.
struct TagChip: View {
    let text: String

    var body: some View {
        Text(text).font(.inter(12, .semibold, relativeTo: .caption)).foregroundStyle(Theme.ink)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.ink.opacity(0.5), lineWidth: 1))
    }
}

/// Where the ranking disagrees with your ratings, biggest gap first, each as a sentence with its direction.
struct AuditSectionView: View {
    let lines: [AuditLine]
    let empty: RankingEmpty?
    let note: String?

    var body: some View {
        Section {
            switch empty {
            case .noRatings: Text("Log tastings with ratings to see where your ranking disagrees.").foregroundStyle(Theme.ink)
            case .noGaps: Text("Your ranking and your ratings agree wherever they can be compared.").foregroundStyle(Theme.ink)
            default: ForEach(lines) { AuditRowView(line: $0) }
            }
            if let note { Text(note).font(.inter(13)).foregroundStyle(Theme.muted) }
        } header: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Where the ranking disagrees with your ratings").font(.inter(14, .semibold)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
                Text("Nothing here changes a rating. A bottle is compared only with others it can be compared to, and one that has only met its own proof band is never compared across bands.")
                    .font(.inter(13)).foregroundStyle(Theme.muted).textCase(nil)
            }
        }
    }
}

struct AuditRowView: View {
    let line: AuditLine
    @Environment(\.dynamicTypeSize) private var typeSize

    private var places: String { "\(line.gap) \(line.gap == 1 ? "place" : "places") \(line.direction == .lower ? "lower" : "higher")" }

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            VStack(alignment: .leading, spacing: 2) {
                Text(line.name).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                Text(line.text).font(.inter(14)).monospacedDigit().foregroundStyle(Theme.muted)
                Text(line.verdict).font(.inter(14)).foregroundStyle(Theme.muted)
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            Label(String(line.gap), systemImage: line.direction == .lower ? "arrowtriangle.down.fill" : "arrowtriangle.up.fill")
                .font(.inter(15, .semibold)).monospacedDigit().foregroundStyle(Theme.ink)
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(line.name). \(line.text). \(line.verdict), \(places)")
    }
}
