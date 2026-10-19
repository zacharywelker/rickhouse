import SwiftUI

/// The Detail layout of one flight: a heavy rule, its name and what it spans, then a row per bottle (name over proof,
/// mashbill and age; at the biggest text sizes each fact gets its own line). A hidden flight (blind, not tasted yet)
/// shows only its band and a blank row per glass, and nothing that could name what is in it.
struct FlightCardView: View {
    let flight: FlightModel
    /// A draft's pending flight can be named.
    let renamable: Bool
    /// Bottles of this flight can be moved or swapped (a draft; never a blind running one).
    let moves: MoveOptions?
    var onRename: () -> Void = {}

    /// What a bottle's ⋯ menu offers, and what it does.
    struct MoveOptions {
        let targets: [MoveTarget]
        let swaps: [SwapTarget]
        let onMove: (_ entryId: Int, _ heatId: Int) -> Void
        let onSwap: (_ entryId: Int) -> Void
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Theme.ink).frame(height: 2)
            titleRow
            if !flight.meta.isEmpty {
                Text(flight.meta).font(.inter(13)).monospacedDigit().foregroundStyle(Theme.muted).padding(.bottom, 4)
            }
            if flight.hidden {
                hiddenRows
            } else {
                ForEach(flight.rows) { row in
                    Divider()
                    FlightRowView(row: row, decided: flight.status == .decided, bye: flight.status == .bye, moves: moves)
                }
                Divider()
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var titleRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            title.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            if renamable {
                Button(action: onRename) {
                    Image(systemName: "pencil").font(.system(size: 16, weight: .medium)).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.ink)
                .accessibilityLabel("Rename flight \(flight.number)")
            }
        }
    }

    private var title: some View {
        let yours = Text("Yours").font(.inter(12, .semibold)).foregroundStyle(Theme.muted)
        return Text(flight.title.yours ? "\(flight.title.text)   \(yours)" : "\(flight.title.text)")
            .font(.inter(17, .semibold)).foregroundStyle(Theme.ink)
            .accessibilityLabel(flight.title.yours ? "\(flight.title.text), named by you" : flight.title.text)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private var hiddenRows: some View {
        ForEach(0..<flight.count, id: \.self) { _ in
            Divider()
            Label("Hidden until it's tasted", systemImage: "eye.slash")
                .font(.inter(14)).foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        Divider()
        if flight.glassesSet > 0 {
            Text("\(flight.glassesSet) of \(flight.count) glasses lettered").font(.inter(13)).foregroundStyle(Theme.muted).padding(.top, 6)
        }
    }
}

/// One bottle in the Detail layout.
struct FlightRowView: View {
    let row: RowModel
    /// The flight is decided: show places, and who goes through.
    let decided: Bool
    let bye: Bool
    let moves: FlightCardView.MoveOptions?
    @Environment(\.dynamicTypeSize) private var typeSize

    private var out: Bool { decided && !row.advanced }
    private var showsPlace: Bool { decided && !bye }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if showsPlace {
                Text(row.place.map(String.init) ?? "").font(.headline(18)).frame(width: 24, alignment: .center).padding(.top, 8).accessibilityHidden(true)
            }
            text.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            if row.advanced {
                Label("Advances", systemImage: "arrow.right").font(.inter(12, .semibold)).foregroundStyle(Theme.ink)
                    .padding(.top, 12).accessibilityHidden(true)
            } else if let moves {
                menu(moves)
            }
        }
        .padding(.leading, 8)
        .frame(minHeight: 44)
        .overlay(alignment: .leading) { if row.advanced { Rectangle().fill(Theme.ink).frame(width: 3) } }
        .foregroundStyle(out ? Theme.muted : Theme.ink)
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.name).font(.inter(16, .medium))
            facts
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spoken)
        .accessibilityActions {
            if let moves {
                ForEach(moves.targets.filter { !$0.full }) { t in Button("Move to \(t.title)") { moves.onMove(row.entryId, t.heatId) } }
                if !moves.swaps.isEmpty { Button("Swap with…") { moves.onSwap(row.entryId) } }
            }
        }
    }

    private var facts: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 10))
        return layout {
            if let glass = row.glass { Text("Glass \(glass)").fixedSize() }
            Text(row.proof == "—" ? "No proof" : "\(row.proof) proof").monospacedDigit().fixedSize(horizontal: false, vertical: true)
            Text(row.mashbill).frame(maxWidth: typeSize.isAccessibilitySize ? nil : .infinity, alignment: .leading)
            Text(row.age).monospacedDigit().fixedSize()
        }
        .font(.inter(13))
        .foregroundStyle(Theme.muted)
    }

    private var spoken: String {
        var parts = [row.name]
        if row.proof != "—" { parts.append("\(row.proof) proof") }
        if row.mashbill != "—" { parts.append(row.mashbill) }
        if row.age != "—" { parts.append(row.age) }
        if let glass = row.glass { parts.append("glass \(glass)") }
        var line = parts.joined(separator: ", ")
        if showsPlace, let place = row.place { line = "Place \(place). " + line }
        return row.advanced ? line + ", advances" : line
    }

    private func menu(_ moves: FlightCardView.MoveOptions) -> some View {
        Menu {
            if !moves.targets.isEmpty {
                Menu("Move to") {
                    ForEach(moves.targets) { t in
                        Button(t.full ? "\(t.title) (full)" : t.title) { moves.onMove(row.entryId, t.heatId) }.disabled(t.full)
                    }
                }
            }
            if !moves.swaps.isEmpty { Button("Swap with…") { moves.onSwap(row.entryId) } }
        } label: {
            Image(systemName: "ellipsis").font(.system(size: 18, weight: .semibold)).frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .foregroundStyle(Theme.ink)
        .accessibilityLabel("Move \(row.name) to another flight")
    }
}

/// The Compact layout of one flight: a line per bottle (place, name, proof).
struct CompactFlightView: View {
    let flight: CompactFlight
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Theme.ink).frame(height: 2)
            Text(flight.title).font(.inter(15, .semibold)).foregroundStyle(Theme.ink).padding(.vertical, 8).accessibilityAddTraits(.isHeader)
            if flight.hidden {
                Label("\(TournamentBracketModel.bottlesText(flight.count)), hidden until tasted", systemImage: "eye.slash")
                    .font(.inter(14)).foregroundStyle(Theme.muted).padding(.bottom, 8)
            }
            ForEach(flight.rows) { row in
                Divider()
                line(row)
            }
            Divider()
        }
        .accessibilityElement(children: .contain)
    }

    private func line(_ row: CompactRow) -> some View {
        let out = flight.status == .decided && !row.advanced
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(row.place.map(String.init) ?? "").font(.headline(16)).frame(width: 22).accessibilityHidden(true)
            layout {
                Text(row.name).font(.inter(15, .medium)).frame(maxWidth: .infinity, alignment: .leading)
                Text(row.proof).font(.inter(14)).monospacedDigit().foregroundStyle(Theme.muted)
                    .accessibilityLabel(row.proof == "—" ? "no proof" : "\(row.proof) proof")
            }
            Image(systemName: "arrow.right").font(.system(size: 13, weight: .semibold)).opacity(row.advanced ? 1 : 0).frame(width: 18)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 6)
        .padding(.leading, 4)
        .frame(minHeight: 36)
        .overlay(alignment: .leading) { if row.advanced { Rectangle().fill(Theme.ink).frame(width: 3) } }
        .foregroundStyle(out ? Theme.muted : Theme.ink)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(compactSpoken(row))
    }

    private func compactSpoken(_ row: CompactRow) -> String {
        var line = row.name + (row.proof == "—" ? "" : ", \(row.proof) proof")
        if let place = row.place { line = "Place \(place). " + line }
        return row.advanced ? line + ", advances" : line
    }
}
