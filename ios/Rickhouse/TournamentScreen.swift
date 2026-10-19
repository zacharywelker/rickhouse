import SwiftUI

/// One tournament: its header, the round selector, the zoom control and the bracket, with the draft's bar pinned below.
/// It draws every state (draft, running, blind, finished); this file wires the draft's actions, and running/finished
/// ones come with the play screens.
struct TournamentScreen: View {
    @Environment(Session.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var model: TournamentModel
    @State private var sheet: Sheet?
    @State private var fieldDraft = FieldState.empty
    @State private var editingField = false
    @State private var confirmingStart = false

    init(id: Int) { _model = State(initialValue: TournamentModel(id: id)) }

    /// The sheets this screen opens, one at a time.
    private enum Sheet: Identifiable {
        case rename(heatId: Int, number: Int, current: String, yours: Bool)
        case swap(name: String, entryId: Int, swaps: [SwapTarget])
        case settings

        var id: String {
            switch self {
            case .rename(let heatId, _, _, _): "rename\(heatId)"
            case .swap(_, let entryId, _): "swap\(entryId)"
            case .settings: "settings"
            }
        }
    }

    var body: some View {
        content
            .background(Theme.paper)
            .navigationTitle("Tournament")
            .navigationBarTitleDisplayMode(.inline)
            .footBar(model.foot)
            .sheet(item: $sheet) { sheetContent($0) }
            .sheet(isPresented: $editingField, onDismiss: saveField) { FieldPickerSheet(field: $fieldDraft) }
            .confirmSheet("Start this tournament?", message: "The field locks when you start. You can still withdraw bottles.",
                          confirm: "Start tournament", cancel: "Not yet", isPresented: $confirmingStart) { Task { await model.start() } }
            .task {
                model.api = { session.api }
                model.signOut = { session.signOut() }
                await model.load()
            }
    }

    @ViewBuilder private var content: some View {
        if let view = model.view, let bracket = model.bracket {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    TournamentHeader(view: view, onSettings: { sheet = .settings }, onField: openField)
                    if TournamentScreenLogic.activeCount(view) < 2 && view.status == .draft {
                        fewEntries
                    } else {
                        ZoomControl(level: model.zoom) { model.setZoom($0) }
                        TournamentBracketView(view: view, bracket: bracket, zoom: model.zoom, chosenRound: $model.chosenRound,
                                              moves: { moveOptions(view, $0, $1) }, onRename: { rename($0) })
                    }
                    if view.status == .draft, typeSize.isAccessibilitySize { draftBar(view, bracket).padding(.horizontal, -16) }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .pinchZoom(model.zoom) { model.setZoom($0) }
            }
            .refreshable { await model.load() }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                // At the biggest text sizes the bar would fill the screen, so it scrolls with the bracket instead.
                if view.status == .draft, !typeSize.isAccessibilitySize { draftBar(view, bracket) }
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

    private func draftBar(_ view: TournamentView, _ bracket: BracketModel) -> some View {
        DraftBar(canStart: TournamentScreenLogic.canStart(view), canReset: TournamentScreenLogic.canStart(view), busy: model.pending,
                 note: TournamentScreenLogic.barNote(view, renamed: bracket.renamed),
                 onStart: { confirmingStart = true }, onReset: { Task { await model.reset() } })
    }

    private var fewEntries: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(TournamentScreenLogic.fewEntries).font(.inter(17, .semibold)).foregroundStyle(Theme.ink)
            Text("A tournament needs a field of at least two. You can fill it now or come back later.").font(.inter(14)).foregroundStyle(Theme.muted)
            Button("Choose bottles", action: openField)
                .font(.inter(16, .semibold)).buttonStyle(.borderedProminent).tint(Theme.ink).frame(minHeight: 44)
        }
        .padding(.top, 8)
    }

    // MARK: Draft actions

    private func moveOptions(_ view: TournamentView, _ column: RoundColumn, _ flight: FlightModel) -> FlightCardView.MoveOptions {
        let swaps = TournamentScreenLogic.swapTargets(column, from: flight)
        return FlightCardView.MoveOptions(
            targets: TournamentScreenLogic.moveTargets(column, from: flight, heatSize: view.heatSize), swaps: swaps,
            onMove: { entry, heat in Task { await model.move(entryId: entry, toHeatId: heat) } },
            onSwap: { entry in
                let name = flight.rows.first { $0.entryId == entry }?.name ?? "bottle"
                sheet = .swap(name: name, entryId: entry, swaps: swaps)
            })
    }

    private func rename(_ flight: FlightModel) {
        sheet = .rename(heatId: flight.id, number: flight.number, current: flight.title.text, yours: flight.title.yours)
    }

    private func openField() {
        guard let view = model.view else { return }
        fieldDraft = TournamentFieldSelection.fieldFromEntries(view.entries)
        editingField = true
    }

    /// The picker has no Save: closing it saves a changed field.
    private func saveField() {
        guard let view = model.view, let patch = TournamentScreenLogic.fieldPatch(original: view.entries, edited: fieldDraft) else { return }
        Task { await model.patch(patch) }
    }

    @ViewBuilder private func sheetContent(_ sheet: Sheet) -> some View {
        switch sheet {
        case .rename(let heatId, let number, let current, let yours):
            RenameFlightSheet(number: number, current: current, yours: yours) { await model.rename(heatId: heatId, label: $0) }
        case .swap(let name, let entryId, let swaps):
            SwapSheet(name: name, swaps: swaps) { await model.swap(entryId: entryId, with: $0.entryId) }
        case .settings:
            if let view = model.view {
                DraftSettingsSheet(view: view, renamed: model.bracket?.renamed ?? 0) { await model.patch($0, inline: true) }
            }
        }
    }
}

/// The name, a line of facts, and (for a draft) the two things you can change about it.
private struct TournamentHeader: View {
    let view: TournamentView
    let onSettings: () -> Void
    let onField: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(view.name).font(.headline(27)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            Text(TournamentScreenLogic.headerMeta(view) + (view.blind ? " · Blind" : "")).font(.inter(14)).foregroundStyle(Theme.muted)
            if let line = TournamentScreenLogic.statusLine(view) { Text(line).font(.inter(14, .semibold)).foregroundStyle(Theme.ink) }
            if let champion = view.champion {
                Label("Champion: \(champion.name)", systemImage: "trophy").font(.inter(16, .semibold)).foregroundStyle(Theme.ink)
            }
            if let note = view.fieldNote, !note.isEmpty { Text(note).font(.inter(14)).foregroundStyle(Theme.muted) }
            if view.status == .draft { draftButtons.padding(.top, 4) }
        }
    }

    private var draftButtons: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            Button(action: onSettings) { Label("Settings", systemImage: "slider.horizontal.3").frame(minHeight: 44) }
            Button(action: onField) { Label("Edit field", systemImage: "list.bullet").frame(minHeight: 44) }
        }
        .font(.inter(15, .semibold)).foregroundStyle(Theme.ink).buttonStyle(.bordered).tint(Theme.ink)
    }
}
