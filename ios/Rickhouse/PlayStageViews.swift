import SwiftUI

// The pieces of the play screen: the main button, a stage heading that takes VoiceOver focus, the ranking list, the
// blind start and mapping stages, and the reveal.

struct PlayBarAction {
    let title: String
    let enabled: Bool
    let busy: Bool
    let run: () -> Void
}

/// The stage's main button, pinned under the content (inline at accessibility sizes, where a bar would fill the screen).
struct PlayBar: View {
    let action: PlayBarAction

    var body: some View {
        Button(action: action.run) {
            HStack(spacing: 8) {
                if action.busy { ProgressView().tint(Theme.paper) }
                Text(action.title).font(.inter(17, .semibold, relativeTo: .headline))
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .foregroundStyle(Theme.paper)
            .background(action.enabled ? Theme.ink : Theme.muted, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(!action.enabled)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(Theme.paper)
        .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.25)).frame(height: 1) }
    }
}

/// A heading that takes VoiceOver focus when its stage appears.
struct StageHeading: View {
    let text: String
    @AccessibilityFocusState private var focused: Bool

    var body: some View {
        Text(text).font(.headline(21)).foregroundStyle(Theme.ink)
            .accessibilityAddTraits(.isHeader)
            .accessibilityFocused($focused)
            .onAppear { focused = true }
    }
}

struct PlayRankRow: Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String?
    /// Words for the arrows: "Move glass B up".
    let label: String
}

/// The ranking list: position, title, and the two arrows (28 pt glyph in a 44 pt target; buttons, not drag).
struct PlayRankView: View {
    let heading: String
    let hint: String
    let rows: [PlayRankRow]
    let disabled: Bool
    let onMove: (Int, Int) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            StageHeading(text: heading)
            Text(hint).font(.inter(14)).foregroundStyle(Theme.muted)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    Divider()
                    line(index, row)
                }
                Divider()
            }
            .disabled(disabled)
        }
    }

    private func line(_ index: Int, _ row: PlayRankRow) -> some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 10))
        return layout {
            HStack(spacing: 10) {
                Text(String(index + 1)).font(.headline(21)).monospacedDigit().frame(width: 28, alignment: .center).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).font(.inter(16, .semibold)).foregroundStyle(Theme.ink)
                    if let detail = row.detail { Text(detail).font(.inter(13)).foregroundStyle(Theme.muted) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Number \(index + 1). \(row.title)\(row.detail.map { ". \($0)" } ?? "")")
            }
            ArrowStepper(upLabel: "Move \(row.label) up", downLabel: "Move \(row.label) down",
                         canMoveUp: RankList.canMove(count: rows.count, index: index, delta: -1),
                         canMoveDown: RankList.canMove(count: rows.count, index: index, delta: 1),
                         onUp: { onMove(index, -1) }, onDown: { onMove(index, 1) })
        }
        .padding(.vertical, 6)
        .frame(minHeight: 56)
    }
}

/// Blind, before the glasses: one sentence and an explicit tap.
struct PlayStartView: View {
    let loading: Bool
    let onShow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            StageHeading(text: "Ready to pour")
            Text(TournamentPlayLogic.startSentence).font(.inter(15)).foregroundStyle(Theme.ink)
            Button(action: onShow) {
                HStack(spacing: 8) {
                    if loading { ProgressView() }
                    Text("Show the glasses").font(.inter(16, .semibold))
                }
                .frame(minHeight: 44).padding(.horizontal, 6)
            }
            .buttonStyle(.borderedProminent).tint(Theme.ink).disabled(loading)
        }
    }
}

/// The pourer's set-up: every bottle beside its glass letter. The only place a blind flight shows names.
struct PlayMappingView: View {
    let rows: [MappingRow]
    let saved: Bool
    let working: Bool
    let onGlass: (Int, String) -> Void
    let onShuffle: () -> Void
    let onSave: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let problem = GlassMapping.problem(rows.map(\.glass))
        VStack(alignment: .leading, spacing: 12) {
            StageHeading(text: TournamentPlayLogic.pourTitle(rows.count))
            Text(TournamentPlayLogic.mappingSentence).font(.inter(14)).foregroundStyle(Theme.muted)
            VStack(spacing: 0) {
                ForEach(rows, id: \.entryId) { row in
                    Divider()
                    line(row)
                }
                Divider()
            }
            if let problem { Text(problem).font(.inter(14)).foregroundStyle(Theme.error) }
            HStack(spacing: 10) {
                Button(action: onShuffle) { Label("Shuffle", systemImage: "shuffle").frame(minHeight: 44) }.disabled(working)
                Button(action: onSave) { Text("Save letters").frame(minHeight: 44) }.disabled(working || saved || problem != nil)
            }
            .font(.inter(15, .semibold)).buttonStyle(.bordered).tint(Theme.ink)
            if !saved { Text("Save the letters before hiding.").font(.inter(13)).foregroundStyle(Theme.muted) }
        }
    }

    private func line(_ row: MappingRow) -> some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            Menu {
                ForEach(GlassMapping.letters(rows.count), id: \.self) { letter in
                    Button { onGlass(row.entryId, letter) } label: {
                        if letter == row.glass { Label(letter, systemImage: "checkmark") } else { Text(letter) }
                    }
                }
            } label: {
                Text(row.glass).font(.headline(21)).foregroundStyle(Theme.ink).frame(width: 56, height: 44)
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink, lineWidth: 1))
            }
            .disabled(working)
            .accessibilityLabel("Glass for \(row.name)")
            .accessibilityValue(row.glass)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name).font(.inter(16, .semibold)).foregroundStyle(Theme.ink)
                Text(TournamentPlayLogic.detail(row.proof, row.mashbill, row.ageYears)).font(.inter(13)).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 8)
        .frame(minHeight: 56)
    }
}

/// The result: places with names, the champion when the tournament ended, and where to go next.
struct PlayRevealView: View {
    let decided: PlayDecided?
    let nextHeatId: Int?
    let onNext: (Int) -> Void
    let onBack: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            StageHeading(text: "Result recorded")
            if let decided {
                VStack(spacing: 0) {
                    ForEach(decided.places, id: \.place) { p in
                        Divider()
                        HStack(spacing: 12) {
                            Text(String(p.place)).font(.headline(21)).monospacedDigit().frame(width: 28)
                            Text(p.name).font(.inter(16, p.place == 1 ? .semibold : .regular))
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8).frame(minHeight: 48)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Place \(p.place). \(p.name)")
                    }
                    Divider()
                }
                if let champion = decided.champion {
                    Label("The tournament is finished. Champion: \(champion)", systemImage: "trophy").font(.headline(20)).foregroundStyle(Theme.ink)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                if let next = nextHeatId {
                    Button { onNext(next) } label: { Text("Next flight").font(.inter(16, .semibold)).frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(.borderedProminent).tint(Theme.ink)
                }
                Button(action: onBack) { Text("Back to the bracket").font(.inter(16, .semibold)).frame(maxWidth: .infinity, minHeight: 44) }
                    .buttonStyle(.bordered).tint(Theme.ink)
            }
        }
    }
}
