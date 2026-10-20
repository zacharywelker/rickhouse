import SwiftUI

/// What the screen shows under its header: the round selector, then the bracket at the chosen zoom. Detail and Compact show
/// one round at a time (the selector picks it); Map shows every round at once. Nothing here names a bottle of a hidden flight.
struct TournamentBracketView: View {
    let view: TournamentView
    let bracket: BracketModel
    let zoom: ZoomLevel
    @Binding var chosenRound: Int?
    /// Draft only: how a flight's bottles move, and naming a flight.
    let moves: (RoundColumn, FlightModel) -> FlightCardView.MoveOptions?
    let onRename: (FlightModel) -> Void
    /// Running only: Play and Undo for a flight.
    var run: (FlightModel) -> FlightRunOptions? = { _ in nil }
    /// Where a flight can go in its round, and moving it there.
    var steps: (FlightModel) -> FlightActions.Steps? = { _ in nil }
    var onShift: (FlightModel, Int) -> Void = { _, _ in }
    @Environment(\.dynamicTypeSize) private var typeSize

    private var options: [RoundOption] { TournamentScreenLogic.roundOptions(bracket) }
    private var shown: Int? { TournamentScreenLogic.effectiveRound(view, options: options, chosen: chosenRound) }
    private var draft: Bool { view.status == .draft }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if zoom == .map {
                TournamentMapView(rows: ZoomProjection.map(bracket), draft: draft, running: view.status == .active)
            } else if let shown, let column = bracket.columns.first(where: { $0.round == shown }) {
                if options.count > 1 { selector(shown) }
                switch column {
                case .round(let c): roundBody(c)
                case .planned(let p): planned(p)
                }
            }
        }
    }

    // MARK: Round selector

    @ViewBuilder private func selector(_ shown: Int) -> some View {
        let binding = Binding<Int>(get: { shown }, set: { chosenRound = $0 })
        if typeSize.isAccessibilitySize || options.count > 4 {
            Picker("Round", selection: binding) { ForEach(options) { Text($0.heading).tag($0.round) } }
                .pickerStyle(.menu).tint(Theme.ink).frame(minHeight: 44)
        } else {
            Picker("Round", selection: binding) { ForEach(options) { Text($0.heading).tag($0.round) } }
                .pickerStyle(.segmented)
        }
    }

    // MARK: A real round

    @ViewBuilder private func roundBody(_ c: RoundColumn) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(c.count) · \(c.note)").font(.inter(13)).foregroundStyle(Theme.muted)
            if draft, bracket.unknownProof > 0, c.round == 1 {
                Text("\(TournamentBracketModel.bottlesText(bracket.unknownProof)) without a proof, put last in a flight.")
                    .font(.inter(13)).foregroundStyle(Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
        if zoom == .compact {
            ForEach(ZoomProjection.compact(bracket, round: c.round)) { f in
                CompactFlightView(flight: f, run: c.flights.first { $0.id == f.id }.flatMap(run))
            }
        } else {
            ForEach(c.flights) { f in
                FlightCardView(flight: f, renamable: FlightActions.canRename(hidden: f.hidden), moves: f.hidden ? nil : moves(c, f), run: run(f),
                               onRename: { onRename(f) }, steps: steps(f), onShift: { onShift(f, $0) })
            }
        }
    }

    // MARK: A round still to come

    private func planned(_ p: PlannedColumn) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Rectangle().fill(Theme.ink).frame(height: 2)
            Text("\(p.title) · \(p.count)").font(.inter(17, .semibold)).foregroundStyle(Theme.ink).padding(.top, 6)
            Text(p.note).font(.inter(14)).foregroundStyle(Theme.muted)
            Text(p.fill).font(.inter(14)).foregroundStyle(Theme.muted)
        }
        .accessibilityElement(children: .combine)
    }
}

private extension BracketColumn {
    var round: Int {
        switch self {
        case .round(let c): c.round
        case .planned(let c): c.round
        }
    }
}
