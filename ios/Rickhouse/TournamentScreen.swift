import SwiftUI

/// One tournament: its header, the round selector, the zoom control and the bracket, with the draft's bar pinned below.
/// It draws every state (draft, running, blind, finished); this file wires the draft's actions and a running one's
/// (Play, Undo, Withdraw, Draw, Reset, Find a bottle). The play screens are their own.
struct TournamentScreen: View {
    @Environment(Session.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var model: TournamentModel
    @State private var sheet: Sheet?
    @State private var fieldDraft = FieldState.empty
    @State private var editingField = false
    @State private var confirmingStart = false
    @State private var find = FindState()
    @State private var findTick = 0
    @State private var playRoute: PlayRoute?
    @State private var withdrawing: (entryId: Int, name: String)?
    @State private var confirmingWithdraw = false
    @State private var drag = DragCoordinator()
    @Environment(\.scenePhase) private var scenePhase

    init(id: Int) { _model = State(initialValue: TournamentModel(id: id)) }

    /// The sheets this screen opens, one at a time.
    private enum Sheet: Identifiable {
        case rename(heatId: Int, number: Int, current: String, yours: Bool)
        case swap(name: String, entryId: Int, swaps: [SwapTarget])
        case settings
        case grouping

        var id: String {
            switch self {
            case .rename(let heatId, _, _, _): "rename\(heatId)"
            case .swap(_, let entryId, _): "swap\(entryId)"
            case .settings: "settings"
            case .grouping: "grouping"
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
                          confirm: "Start tournament", cancel: "Not yet", destructive: false, isPresented: $confirmingStart) { Task { await model.start() } }
            .confirmSheet(TournamentRunLogic.withdrawTitle(withdrawing?.name ?? "this bottle"), message: TournamentRunLogic.withdrawMessage,
                          confirm: "Withdraw", cancel: "Keep it in", isPresented: $confirmingWithdraw) {
                if let target = withdrawing { Task { await model.withdraw(entryId: target.entryId) } }
            }
            .navigationDestination(item: $playRoute) { PlayFlightView(tournamentID: model.id, heatID: $0.heatID, drawn: $0.drawn) }
            // Coming back from a flight: what was decided there shows at once.
            .onAppear { if model.hasLoaded { Task { await model.load() } } }
            .environment(drag)
            // A drag released outside every target has no end callback: forget it when the screen or the app goes away.
            .onDisappear { drag.reset() }
            .onChange(of: scenePhase) { if scenePhase != .active { drag.reset() } }
            .task {
                drag.notice = { [model] in model.foot.show($0) }
                drag.view = { [model] in model.view }
                drag.busy = { [model] in model.pending }
                drag.perform = { [model] outcome, said in
                    Task {
                        let result: ActionResult
                        switch outcome {
                        case .move(let entryId, let toHeatId): result = await model.move(entryId: entryId, toHeatId: toHeatId)
                        case .swap(let entryId, let other): result = await model.swap(entryId: entryId, with: other, inline: false)
                        case .reorder(let heatId, let toSlot): result = await model.moveFlight(heatId: heatId, toSlot: toSlot)
                        case .none: return
                        }
                        if result == .done, let said { AccessibilityNotification.Announcement(said).post() }
                    }
                }
                model.api = { session.api }
                model.signOut = { session.signOut() }
                await model.load()
            }
    }

    @ViewBuilder private var content: some View {
        if let view = model.view, let bracket = model.bracket {
            let matches = find.matches(view)
            let options = TournamentScreenLogic.roundOptions(bracket)
            let shown = TournamentScreenLogic.effectiveRound(view, options: options, chosen: model.chosenRound)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        TournamentHeader(view: view, onSettings: { sheet = .settings }, onGrouping: { sheet = .grouping }, onField: openField)
                        if TournamentScreenLogic.activeCount(view) < 2 && view.status == .draft {
                            fewEntries
                        } else {
                            ZoomControl(level: model.zoom) { model.setZoom($0) }
                            if view.status != .draft, model.zoom != .map {
                                FindBar(find: find, count: matches.count, onQuery: { find.setQuery($0) }, onStep: { step($0, matches, proxy) })
                            }
                            TournamentBracketView(view: view, bracket: bracket, zoom: model.zoom, chosenRound: $model.chosenRound,
                                                  moves: { moveOptions(view, $0, $1) }, onRename: { rename($0) }, run: runOptions(view),
                                                  steps: { flight in heat(view, flight.id).flatMap { FlightActions.flightSteps(view, $0) } },
                                                  onShift: { flight, slot in shift(flight.id, to: slot) })
                        }
                        if typeSize.isAccessibilitySize, let offer = TournamentRunLogic.bar(view) { runBar(offer).padding(.horizontal, -16) }
                        StandingsSection(title: TournamentRunLogic.standingsTitle(view), rows: TournamentStandings.rows(view))
                        if view.status == .draft, typeSize.isAccessibilitySize { draftBar(view, bracket).padding(.horizontal, -16) }
                    }
                    .environment(\.findHighlight, shown.map { find.highlight(matches, round: $0) } ?? FindHighlight())
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .pinchZoom(model.zoom) { model.setZoom($0) }
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .refreshable { await model.load() }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                // At the biggest text sizes a bar would fill the screen, so it scrolls with the bracket instead.
                if !typeSize.isAccessibilitySize {
                    if view.status == .draft { draftBar(view, bracket) }
                    else if let offer = TournamentRunLogic.bar(view) { runBar(offer) }
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

    private func runBar(_ offer: RunBarOffer) -> some View {
        RunBar(offer: offer, busy: model.pending,
               onDraw: { Task { await model.draw { playRoute = PlayRoute(heatID: $0.heatId, drawn: DrawnHeatHolder($0)) } } },
               onReset: { Task { await model.reset() } })
    }

    /// Next / Previous: lands on a match, shows its round, and scrolls to it once the round is on screen.
    private func step(_ direction: Int, _ matches: [Match], _ proxy: ScrollViewProxy) {
        guard find.step(direction, count: matches.count) != nil, let match = find.current(in: matches) else { return }
        model.chosenRound = match.round
        Task {
            try? await Task.sleep(for: .milliseconds(120))
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { proxy.scrollTo(TournamentFind.scrollID(match.entryId), anchor: .center) }
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

    private func heat(_ view: TournamentView, _ id: Int) -> TournamentHeat? { view.rounds.flatMap(\.heats).first { $0.id == id } }

    /// The bottle menu of a flight: move and swap where the rules allow, and withdraw for the bottles that can leave.
    private func moveOptions(_ view: TournamentView, _ column: RoundColumn, _ flight: FlightModel) -> FlightCardView.MoveOptions? {
        guard let heat = heat(view, flight.id) else { return nil }
        let controls = FlightActions.flightControls(view, heat)
        let removable = FlightActions.canRemove(view, heat)
        guard controls.move || !controls.withdraw.isEmpty || removable else { return nil }
        let swaps = controls.move ? TournamentScreenLogic.swapTargets(column, from: flight) : []
        return FlightCardView.MoveOptions(
            targets: controls.move ? TournamentScreenLogic.moveTargets(column, from: flight, heatSize: view.heatSize) : [], swaps: swaps,
            withdrawable: Set(controls.withdraw), removable: removable,
            onRemove: { entry, name in Task { await model.remove(entryId: entry, name: name) } },
            onMove: { entry, heat in Task { await model.move(entryId: entry, toHeatId: heat) } },
            onSwap: { entry in
                let name = flight.rows.first { $0.entryId == entry }?.name ?? "bottle"
                sheet = .swap(name: name, entryId: entry, swaps: swaps)
            },
            onWithdraw: { entry, name in
                withdrawing = (entry, name)
                confirmingWithdraw = true
            })
    }

    /// Play and Undo for a flight of a running or finished tournament.
    private func runOptions(_ view: TournamentView) -> (FlightModel) -> FlightRunOptions? {
        { flight in
            guard view.status != .draft, let heat = heat(view, flight.id) else { return nil }
            let controls = FlightActions.flightControls(view, heat)
            guard controls.play || controls.undo else { return nil }
            return FlightRunOptions(play: controls.play, undo: controls.undo,
                                    onPlay: { playRoute = PlayRoute(heatID: flight.id) },
                                    onUndo: { Task { await model.undo(heatId: flight.id) } })
        }
    }

    /// A chevron (or the Compact header's VoiceOver action): say what a drag would have said once it is saved. The words are
    /// built before the move, while the flight still has its old number.
    private func shift(_ heatId: Int, to slot: Int) {
        guard let view = model.view else { return }
        let outcome = DropOutcome.reorder(heatId: heatId, toSlot: slot)
        let said = DragModel.describeOutcome(view, outcome)
        Task {
            if await model.moveFlight(heatId: heatId, toSlot: slot) == .done, let said { AccessibilityNotification.Announcement(said).post() }
        }
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
        case .grouping:
            if let view = model.view { GroupingSheet(view: view) { await model.patch($0, inline: true) } }
        }
    }
}

/// The name, a line of facts, and (for a draft) the two things you can change about it.
private struct TournamentHeader: View {
    let view: TournamentView
    let onSettings: () -> Void
    let onGrouping: () -> Void
    let onField: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(view.name).font(.headline(27)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            Text(TournamentScreenLogic.headerMeta(view) + (view.blind ? " · Blind" : "")).font(.inter(14)).foregroundStyle(Theme.muted)
            if let line = TournamentScreenLogic.statusLine(view) { Text(line).font(.inter(14, .semibold)).foregroundStyle(Theme.ink) }
            if let line = TournamentRunLogic.blindLine(view) { Text(line).font(.inter(14)).foregroundStyle(Theme.muted) }
            if let champion = view.champion {
                Label("Champion: \(champion.name)", systemImage: "trophy").font(.headline(20)).foregroundStyle(Theme.ink).padding(.top, 4)
                    .accessibilityElement(children: .combine)
            }
            if view.status == .complete {
                NavigationLink { RankingView() } label: { Label("Ranking and audit", systemImage: "list.number").frame(minHeight: 44) }
                    .font(.inter(15, .semibold)).foregroundStyle(Theme.ink)
            }
            if let note = view.fieldNote, !note.isEmpty { Text(note).font(.inter(14)).foregroundStyle(Theme.muted) }
            if view.status == .draft { draftButtons.padding(.top, 4) }
            if view.status == .active {
                Button(action: onGrouping) { Label("Grouping", systemImage: "slider.horizontal.3").frame(minHeight: 44) }
                    .font(.inter(15, .semibold)).foregroundStyle(Theme.ink).buttonStyle(.bordered).tint(Theme.ink).padding(.top, 4)
            }
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
