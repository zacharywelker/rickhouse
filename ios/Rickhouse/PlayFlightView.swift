import SwiftUI

/// Play one flight (spec section 5). "Next flight" swaps the flight in place, so the back button still returns to the bracket.
struct PlayFlightView: View {
    let tournamentID: Int
    let heatID: Int
    var drawn: DrawnHeatHolder?
    @State private var current: Int

    init(tournamentID: Int, heatID: Int, drawn: DrawnHeatHolder? = nil) {
        self.tournamentID = tournamentID
        self.heatID = heatID
        self.drawn = drawn
        _current = State(initialValue: heatID)
    }

    var body: some View {
        PlayFlightScreen(tournamentID: tournamentID, heatID: current, drawn: current == heatID ? drawn : nil) { current = $0 }
            .id(current)
    }
}

private struct PlayFlightScreen: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var model: PlayModel
    let onNext: (Int) -> Void

    init(tournamentID: Int, heatID: Int, drawn: DrawnHeatHolder?, onNext: @escaping (Int) -> Void) {
        _model = State(initialValue: PlayModel(tournamentID: tournamentID, heatID: heatID, drawn: drawn))
        self.onNext = onNext
    }

    var body: some View {
        content
            .background(Theme.paper)
            .navigationTitle("Flight")
            .navigationBarTitleDisplayMode(.inline)
            .footBar(model.foot, onUndo: { model.runUndo($0) })
            .onChange(of: model.undone) { _, undone in if undone { dismiss() } }
            .task {
                model.api = { session.api }
                model.signOut = { session.signOut() }
                await model.load()
            }
    }

    @ViewBuilder private var content: some View {
        if model.hasLoaded {
            if let stopped = model.stopped, !model.revealed {
                stoppedNotice(stopped)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        PlayHeader(model: model)
                        stage
                        if typeSize.isAccessibilitySize, let bar = barAction { PlayBar(action: bar).padding(.horizontal, -16) }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if !typeSize.isAccessibilitySize, let bar = barAction { PlayBar(action: bar) }
                }
            }
        } else if let error = model.loadError {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "wifi.slash")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func stoppedNotice(_ why: PlayStopped) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(why.text).font(.inter(17, .semibold)).foregroundStyle(Theme.ink)
            Button("Back to the bracket") { dismiss() }
                .font(.inter(16, .semibold)).buttonStyle(.bordered).tint(Theme.ink).frame(minHeight: 44)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
    }

    @ViewBuilder private var stage: some View {
        if model.revealed {
            PlayRevealView(decided: model.decided, nextHeatId: model.decided?.nextHeatId, onNext: onNext, onBack: { dismiss() })
        } else if model.blind {
            switch model.flow {
            case .start, .loading:
                PlayStartView(loading: model.flow == .loading) { Task { await model.show() } }
            case .mapping(let rows, let saved, _):
                PlayMappingView(rows: rows, saved: saved, working: model.working, onGlass: { model.setGlass(entryId: $0, glass: $1) },
                                onShuffle: { model.shuffle() }, onSave: { Task { await model.saveLetters() } })
            case .rank(let order):
                PlayRankView(heading: "Rank the glasses", hint: TournamentPlayLogic.rankHint(blind: true),
                             rows: order.map { PlayRankRow(id: $0, title: "Glass \($0)", detail: nil, label: "glass \($0)") },
                             disabled: model.recording, onMove: { model.move(index: $0, delta: $1) })
            case .revealed:
                EmptyView()
            }
        } else {
            PlayRankView(heading: "Rank the bottles", hint: TournamentPlayLogic.rankHint(blind: false),
                         rows: model.order.map { PlayRankRow(id: String($0.entryId), title: $0.name, detail: $0.detail, label: $0.name) },
                         disabled: model.recording, onMove: { model.move(index: $0, delta: $1) })
        }
    }

    /// The one main button of the stage; the mapping stage has its own three in the stage itself.
    private var barAction: PlayBarAction? {
        if model.revealed { return nil }
        if model.blind {
            switch model.flow {
            case .mapping(let rows, let saved, _):
                let ok = saved && GlassMapping.problem(rows.map(\.glass)) == nil && !model.working
                return PlayBarAction(title: "Hide and hand over", enabled: ok, busy: false) { model.hide() }
            case .rank:
                return PlayBarAction(title: "Lock in and reveal", enabled: !model.recording, busy: model.recording) { Task { await model.record() } }
            default:
                return nil
            }
        }
        return PlayBarAction(title: "Record result", enabled: !model.recording, busy: model.recording) { Task { await model.record() } }
    }
}

/// Flight name, its facts, and the round.
private struct PlayHeader: View {
    let model: PlayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.title).font(.headline(27)).foregroundStyle(Theme.ink)
            if !model.meta.isEmpty { Text(model.meta).font(.inter(14)).foregroundStyle(Theme.muted) }
            if let line = roundLine { Text(line).font(.inter(14)).foregroundStyle(Theme.muted) }
            if model.blind { Text("Blind").font(.inter(13, .semibold)).foregroundStyle(Theme.ink).padding(.top, 2) }
        }
        .accessibilityElement(children: .combine)
    }

    private var roundLine: String? {
        guard let heat = model.view?.rounds.flatMap(\.heats).first(where: { $0.id == model.heatID }) else { return nil }
        return "Round \(heat.round) · \(TournamentBracketModel.bottlesText(heat.entryCount))"
    }
}
