import SwiftUI

/// Plays one flight. An open tournament ranks its bottles; a blind one goes start, mapping, rank, revealed
/// (`TournamentPlayFlow`). After `hide` the state holds only glass letters: no name is kept anywhere in this model.
/// A failure keeps the ranking and shows in the foot bar with Retry.
@MainActor @Observable
final class PlayModel {
    let tournamentID: Int
    let heatID: Int
    private(set) var view: TournamentView?
    private(set) var loadError: String?
    private(set) var hasLoaded = false
    private(set) var stopped: PlayStopped?
    private(set) var blind = false
    /// The flight's title and facts line, for the heading.
    private(set) var title = "Flight"
    private(set) var meta = ""
    /// An open tournament's bottles in the order the person ranked them.
    private(set) var order: [PlayEntry] = []
    private(set) var flow: Flow
    private(set) var decided: PlayDecided?
    /// A save or draw is on its way.
    private(set) var working = false
    /// The result is on its way: the second tap does nothing.
    private(set) var recording = false
    /// Set once Undo took the result back: the screen leaves.
    private(set) var undone = false
    let foot = FootBar()

    @ObservationIgnored var api: () -> APIClient? = { nil }
    @ObservationIgnored var signOut: () -> Void = {}
    @ObservationIgnored private var pendingDraw: DrawnHeat?

    /// `drawn`: the pourer drew this flight from the bracket, so the glasses open at once.
    init(tournamentID: Int, heatID: Int, drawn: DrawnHeat? = nil) {
        self.tournamentID = tournamentID
        self.heatID = heatID
        pendingDraw = drawn
        flow = TournamentPlayFlow.initialFlow(drawn: drawn != nil)
    }

    var revealed: Bool { flow == .revealed }

    // MARK: Loading

    func load() async {
        guard let api = api() else { return }
        do {
            let next = try await api.tournament(id: tournamentID)
            adopt(next)
            loadError = nil
            if !hasLoaded { start(next) }
            hasLoaded = true
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if hasLoaded { foot.fail(error, retry: { Task { await self.load() } }) } else { loadError = error.localizedDescription }
        }
    }

    private func adopt(_ next: TournamentView) {
        view = next
        blind = next.blind
        let model = TournamentBracketModel.build(next)
        let flight = model.columns.compactMap { column -> FlightModel? in
            if case .round(let c) = column { return c.flights.first { $0.id == heatID } } else { return nil }
        }.first
        title = flight?.title.text ?? "Flight"
        meta = flight?.meta ?? ""
        decided = TournamentPlayLogic.decided(next, heatId: heatID)
    }

    /// The first load decides what this screen is: a notice, an already-decided flight, or a flight to play.
    private func start(_ next: TournamentView) {
        guard let heat = next.rounds.flatMap(\.heats).first(where: { $0.id == heatID }) else { loadError = "That flight is gone."; return }
        if let why = TournamentPlayLogic.stopped(next, heat) {
            stopped = why
            return
        }
        if !next.blind {
            let flight = TournamentBracketModel.build(next).columns.compactMap { column -> FlightModel? in
                if case .round(let c) = column { return c.flights.first { $0.id == heatID } } else { return nil }
            }.first
            order = flight.map(TournamentPlayLogic.entries) ?? []
        } else if let drawn = pendingDraw {
            flow = TournamentPlayFlow.reduce(flow, .loaded(TournamentPlayLogic.mappingRows(drawn)))
        }
        pendingDraw = nil
    }

    // MARK: Blind flow

    /// Show the glasses: asks the server to open this flight for pouring (it keeps the letters).
    func show() async {
        guard case .start = flow, !working, let api = api() else { return }
        flow = TournamentPlayFlow.reduce(flow, .show)
        working = true
        defer { working = false }
        do {
            let drawn = try await api.drawFlight(tournamentId: tournamentID, heatId: heatID)
            flow = TournamentPlayFlow.reduce(flow, .loaded(TournamentPlayLogic.mappingRows(drawn)))
        } catch APIError.unauthorized {
            signOut()
            flow = TournamentPlayFlow.reduce(flow, .failed)
        } catch {
            flow = TournamentPlayFlow.reduce(flow, .failed)
            foot.fail(error, retry: { Task { await self.show() } })
        }
    }

    /// Gives the bottle the letter; the bottle that had it takes the old one, so the letters stay different.
    func setGlass(entryId: Int, glass: String) {
        guard case .mapping(let rows, _, _) = flow, let index = rows.firstIndex(where: { $0.entryId == entryId }) else { return }
        flow = TournamentPlayFlow.reduce(flow, .setAll(GlassMapping.assign(rows.map(\.glass), index: index, letter: glass)))
    }

    func shuffle() {
        guard case .mapping(let rows, _, _) = flow else { return }
        flow = TournamentPlayFlow.reduce(flow, .setAll(GlassMapping.shuffled(rows.count)))
    }

    func saveLetters() async {
        guard case .mapping(let rows, _, _) = flow, !working, let api = api() else { return }
        let sent = rows.map { SentGlass(entryId: $0.entryId, glass: $0.glass) }
        working = true
        defer { working = false }
        do {
            _ = try await api.setGlasses(tournamentId: tournamentID, heatId: heatID, assign: sent.map { ($0.entryId, $0.glass) })
            flow = TournamentPlayFlow.reduce(flow, .saved(sent: sent))
        } catch APIError.unauthorized {
            signOut()
        } catch {
            foot.fail(error, retry: { Task { await self.saveLetters() } })
        }
    }

    /// Drops every name: from here the state is letters only.
    func hide() {
        let before = flow
        flow = TournamentPlayFlow.reduce(flow, .hide)
        if flow != before { AccessibilityNotification.Announcement("Names hidden").post() }
    }

    // MARK: Ranking

    func move(index: Int, delta: Int) {
        let label: String
        let count: Int
        switch flow {
        case .rank(let letters):
            guard RankList.canMove(count: letters.count, index: index, delta: delta) else { return }
            flow = TournamentPlayFlow.reduce(flow, .move(index: index, delta: delta))
            label = "Glass \(letters[index])"
            count = letters.count
        default:
            guard RankList.canMove(count: order.count, index: index, delta: delta) else { return }
            label = order[index].name
            count = order.count
            order = RankList.move(order, index: index, delta: delta)
        }
        AccessibilityNotification.Announcement(TournamentPlayLogic.moved(label, to: index + delta, of: count)).post()
    }

    /// Sends the result. One at a time; a failure keeps the ranking on screen. "Already decided" shows the result.
    func record() async {
        guard !recording, !revealed, let api = api() else { return }
        recording = true
        defer { recording = false }
        do {
            let next: TournamentView
            if case .rank(let letters) = flow {
                next = try await api.recordFlight(tournamentId: tournamentID, heatId: heatID, glasses: letters)
            } else {
                next = try await api.recordFlight(tournamentId: tournamentID, heatId: heatID, ranking: order.map(\.entryId))
            }
            finish(next)
        } catch APIError.unauthorized {
            signOut()
        } catch APIError.server(let message) where TournamentPlayLogic.isAlreadyDecided(message) {
            if let fresh = try? await api.tournament(id: tournamentID) { adopt(fresh) }
            flow = TournamentPlayFlow.reduce(flow, .recorded)
        } catch {
            foot.fail(error, retry: { Task { await self.record() } })
        }
    }

    private func finish(_ next: TournamentView) {
        adopt(next)
        flow = TournamentPlayFlow.reduce(flow, .recorded)
        order = []
        guard let api = api() else { return }
        let (t, h) = (tournamentID, heatID)
        foot.offer(UndoOffer(message: "Result recorded.") { [weak self] in
            _ = try await api.undoFlight(tournamentId: t, heatId: h)
            self?.undone = true
        })
    }

    /// The foot bar's Undo: a failure shows there with Retry.
    func runUndo(_ offer: UndoOffer) {
        foot.dropUndo()
        Task {
            do { try await offer.run() } catch APIError.unauthorized { signOut() } catch {
                foot.fail(error, retry: { self.runUndo(offer) })
            }
        }
    }
}
