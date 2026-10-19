import SwiftUI

/// The Map layout: no bottle text at all. Finished rounds are one summary line, the round being played (or the last one)
/// is a tile per flight, and rounds still to come are counts.
struct TournamentMapView: View {
    let rows: [MapRow]
    let draft: Bool
    let running: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        ForEach(rows.indices, id: \.self) { i in
            switch rows[i] {
            case .finished(let summary):
                Label(summary, systemImage: "checkmark.circle").font(.inter(14)).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            case .current(let heading, let tiles):
                current(heading, tiles)
            case .later(let heading, let count, let detail):
                VStack(alignment: .leading, spacing: 2) {
                    Text(heading).font(.inter(15, .semibold)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
                    Text("\(detail) · \(count)").font(.inter(13)).foregroundStyle(Theme.muted)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func current(_ heading: String, _ tiles: [MapTile]) -> some View {
        let decided = tiles.filter { $0.status == .decided || $0.status == .bye }.count
        let line = draft || !running ? TournamentBracketModel.plural(tiles.count, "flight") : "\(decided) of \(TournamentBracketModel.plural(tiles.count, "flight")) decided"
        return VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(heading + (running ? " · now" : "")).font(.inter(15, .semibold)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
                Text(line).font(.inter(13)).monospacedDigit().foregroundStyle(Theme.muted)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 280 : 150), spacing: 8)], spacing: 8) {
                ForEach(tiles) { tile($0) }
            }
        }
        .padding(.top, 4)
    }

    private func tile(_ t: MapTile) -> some View {
        let status = TournamentScreenLogic.tileStatusText(t.status, draft: draft)
        return VStack(alignment: .leading, spacing: 6) {
            Text(t.text).font(.inter(14, .semibold)).foregroundStyle(Theme.ink).frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 3) {
                ForEach(0..<min(t.markers, 8), id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 2).fill(t.status == .hidden ? Color.clear : Theme.ink.opacity(0.75)).frame(width: 10, height: 14)
                        .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(Theme.ink.opacity(0.75), lineWidth: 1))
                }
            }
            .accessibilityHidden(true)
            Label(status, systemImage: icon(t.status)).font(.inter(13)).foregroundStyle(Theme.muted)
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
        .background(Theme.ink.opacity(0.05), in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink.opacity(0.25), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(t.text), \(TournamentBracketModel.bottlesText(t.markers)), \(status.lowercased())")
    }

    private func icon(_ s: TileStatus) -> String {
        switch s {
        case .decided: "checkmark.circle.fill"
        case .bye: "arrow.right.circle"
        case .hidden: "eye.slash"
        case .pending: "circle"
        }
    }
}
