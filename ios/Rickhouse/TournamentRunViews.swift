import SwiftUI

// The pieces a running or finished tournament adds to the screen: what a flight offers (Play, Undo), the bar, the
// standings, and Find a bottle with the mark it leaves on a row.

/// What one flight offers while the tournament runs.
struct FlightRunOptions {
    let play: Bool
    let undo: Bool
    let onPlay: () -> Void
    let onUndo: () -> Void
}

/// Play (the main thing to do with a pending flight) and Undo (taking a result back). Side by side, stacked at accessibility sizes.
struct FlightRunButtons: View {
    let title: String
    let run: FlightRunOptions
    var compact = false
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 10))
        layout {
            if run.play {
                Button(action: run.onPlay) {
                    Label("Play", systemImage: "play.fill").font(.inter(16, .semibold)).foregroundStyle(Theme.paper)
                        .frame(maxWidth: compact || typeSize.isAccessibilitySize ? .infinity : nil, minHeight: 44)
                        .padding(.horizontal, 18).background(Theme.ink, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Play \(title)")
            }
            if run.undo {
                Button(action: run.onUndo) {
                    Label("Undo", systemImage: "arrow.uturn.backward").font(.inter(15, .semibold)).foregroundStyle(Theme.ink)
                        .frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : nil, minHeight: 44).padding(.horizontal, 14)
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Undo this result (removes the next round): \(title)")
            }
        }
    }
}

/// The bar of a running tournament: Draw a flight (blind) and Reset to automatic (no question; decided flights stay).
struct RunBar: View {
    let offer: RunBarOffer
    let busy: Bool
    let onDraw: () -> Void
    let onReset: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            if offer.draw {
                Button(action: onDraw) {
                    Text("Draw a flight").font(.inter(17, .semibold, relativeTo: .headline)).frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(Theme.paper).background(busy ? Theme.muted : Theme.ink, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain).disabled(busy)
                .accessibilityHint("Picks a flight at random and opens its glasses")
            }
            if offer.reset {
                Button(action: onReset) {
                    Text("Reset to automatic").font(.inter(16, .semibold, relativeTo: .body)).frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(busy ? Theme.muted : Theme.ink)
                }
                .buttonStyle(.plain).disabled(busy)
                .accessibilityHint(TournamentRunLogic.resetNote)
                Text(TournamentRunLogic.resetNote).font(.inter(13)).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(Theme.paper)
        .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.25)).frame(height: 1) }
    }
}

/// Who finished where: place, name, and where it left the tournament (or last poured).
struct StandingsSection: View {
    let title: String
    let rows: [StandingRow]
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.inter(15, .semibold)).foregroundStyle(Theme.ink).padding(.bottom, 6).accessibilityAddTraits(.isHeader)
                ForEach(rows) { row in
                    Divider()
                    line(row)
                }
                Divider()
            }
            .padding(.top, 8)
        }
    }

    private func line(_ row: StandingRow) -> some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 10))
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(row.place).font(.headline(17)).monospacedDigit().frame(width: typeSize.isAccessibilitySize ? 44 : 32, alignment: .leading)
                .accessibilityHidden(true)
            layout {
                Text(row.name).font(.inter(15, row.champion ? .semibold : .regular)).frame(maxWidth: .infinity, alignment: .leading)
                Text(row.left).font(.inter(13, row.champion ? .semibold : .regular)).foregroundStyle(row.champion ? Theme.ink : Theme.muted)
            }
        }
        .padding(.vertical, 8)
        .padding(.leading, row.champion ? 8 : 0)
        .frame(minHeight: 44)
        .overlay(alignment: .leading) { if row.champion { Rectangle().fill(Theme.ink).frame(width: 3) } }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Place \(row.place). \(row.name). \(row.left)")
    }
}

/// Find a bottle: the box, then Previous / Next and where you are. Matches are marked in the round on screen.
struct FindBar: View {
    let find: FindState
    let count: Int
    let onQuery: (String) -> Void
    let onStep: (Int) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SearchField(prompt: "Find a bottle", text: Binding(get: { find.query }, set: onQuery)).padding(.horizontal, -16).padding(.bottom, 0)
            if find.searching {
                let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    HStack(spacing: 8) {
                        step("chevron.up", "Previous match", -1)
                        step("chevron.down", "Next match", 1)
                    }
                    Text(find.status(count: count)).font(.inter(14)).monospacedDigit().foregroundStyle(Theme.muted)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
        }
    }

    private func step(_ icon: String, _ label: String, _ direction: Int) -> some View {
        Button { onStep(direction) } label: {
            Image(systemName: icon).font(.system(size: 16, weight: .semibold)).frame(width: 44, height: 44)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink.opacity(count == 0 ? 0.25 : 1), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .foregroundStyle(count == 0 ? Theme.muted : Theme.ink)
        .disabled(count == 0)
        .accessibilityLabel(label)
    }
}

// MARK: The mark a search leaves

private struct FindHighlightKey: EnvironmentKey { static let defaultValue = FindHighlight() }

extension EnvironmentValues {
    var findHighlight: FindHighlight {
        get { self[FindHighlightKey.self] }
        set { self[FindHighlightKey.self] = newValue }
    }
}

extension View {
    /// Tints a row that matches the search (more strongly for the one "Next" is on) and lets the page scroll to it by `findScrollID`.
    func findMark(entryId: Int, highlight: FindHighlight) -> some View {
        let current = highlight.currentEntryId == entryId
        let matched = highlight.entryIds.contains(entryId)
        return self
            .background(current ? Theme.ink.opacity(0.18) : matched ? Theme.ink.opacity(0.08) : Color.clear)
            .overlay(alignment: .leading) { if current { Rectangle().fill(Theme.ink).frame(width: 3) } }
            .id(TournamentFind.scrollID(entryId))
    }
}

enum TournamentFind {
    static func scrollID(_ entryId: Int) -> String { "entry-\(entryId)" }
}

// MARK: Playing (replaced by the play screens)

/// Where Play and Draw lead. `drawn` is set when the pourer drew the flight (blind), so the play screen starts at the glasses.
struct PlayRoute: Hashable, Identifiable {
    let heatID: Int
    var drawn: DrawnHeat?
    var id: Int { heatID }
    static func == (a: PlayRoute, b: PlayRoute) -> Bool { a.heatID == b.heatID }
    func hash(into h: inout Hasher) { h.combine(heatID) }
}
