import Foundation

/// How an action ended. A sheet shows `failed` itself; the screen's foot bar shows the rest.
enum ActionResult: Equatable {
    case done
    case failed(message: String, fields: [String: String])
    /// Another change was still being saved; nothing was sent.
    case busy
}

/// One tournament on screen: loads the view, runs the draft's actions, and after ANY failure loads the view again, so the
/// page never keeps showing something the server no longer has. One change at a time (`pending`).
@MainActor @Observable
final class TournamentModel {
    let id: Int
    private(set) var view: TournamentView?
    /// The bracket of `view`, worked out once per change.
    private(set) var bracket: BracketModel?
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    private(set) var pending = false
    /// The round the person picked; nil follows the round being played.
    var chosenRound: Int?
    private(set) var zoom: ZoomLevel
    let foot = FootBar()

    @ObservationIgnored var api: () -> APIClient? = { nil }
    @ObservationIgnored var signOut: () -> Void = {}
    @ObservationIgnored private let zoomStore: ZoomStore

    init(id: Int, zoomStore: ZoomStore = UserDefaultsZoomStore()) {
        self.id = id
        self.zoomStore = zoomStore
        zoom = zoomStore.level(forTournament: id)
    }

    func setZoom(_ level: ZoomLevel) {
        zoom = level
        zoomStore.set(level, forTournament: id)
    }

    private func adopt(_ next: TournamentView) {
        view = next
        bracket = TournamentBracketModel.build(next)
    }

    /// Loads (or reloads) the view. The first failure is `loadError`; a later one keeps the page and offers Retry.
    func load() async {
        guard let api = api() else { return }
        do {
            adopt(try await api.tournament(id: id))
            hasLoaded = true
            loadError = nil
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if hasLoaded { foot.fail(error, retry: { Task { await self.load() } }) } else { loadError = error.localizedDescription }
        }
    }

    // MARK: Actions

    func rename(heatId: Int, label: String?) async -> ActionResult {
        await run(inline: true) { try await $0.renameFlight(tournamentId: self.id, heatId: heatId, label: label) }
    }

    func move(entryId: Int, toHeatId: Int) async {
        await run { try await $0.moveEntry(tournamentId: self.id, entryId: entryId, toHeatId: toHeatId) }
    }

    func swap(entryId: Int, with other: Int) async -> ActionResult {
        await run(inline: true) { try await $0.swapEntries(tournamentId: self.id, entryId: entryId, withEntryId: other) }
    }

    func start() async {
        if await run({ try await $0.startTournament(id: self.id) }) == .done { chosenRound = nil }
    }

    func reset() async {
        await run { try await $0.resetTournament(id: self.id) }
    }

    /// Takes a result back; the server refuses once a flight of the next round has one, and that shows in the foot bar.
    func undo(heatId: Int) async {
        await run { try await $0.undoFlight(tournamentId: self.id, heatId: heatId) }
    }

    func withdraw(entryId: Int) async {
        await run { try await $0.withdrawEntry(tournamentId: self.id, entryId: entryId) }
    }

    /// A random flight to taste (blind): hands the pourer's glasses to `open`. A failure goes to the foot bar, whose Retry draws again.
    func draw(then open: @escaping (DrawnHeat) -> Void) async {
        guard !pending, let api = api() else { return }
        pending = true
        defer { pending = false }
        do {
            open(try await api.drawFlight(tournamentId: id))
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if let fresh = try? await api.tournament(id: id) { adopt(fresh) }
            foot.fail(error.localizedDescription, retry: { Task { await self.draw(then: open) } })
        }
    }

    /// Settings or the field. `inline` for the settings sheet, which shows the failure itself.
    @discardableResult
    func patch(_ patch: TournamentPatch, inline: Bool = false) async -> ActionResult {
        await run(inline: inline) { try await $0.patchTournament(id: self.id, patch) }
    }

    /// Sends one change and takes the view it answers with. A failure is reported (in the foot bar with Retry, or returned
    /// for a sheet to show) and the view is loaded again.
    @discardableResult
    private func run(inline: Bool = false, _ call: @escaping (APIClient) async throws -> TournamentView) async -> ActionResult {
        guard !pending else { return .busy }
        guard let api = api() else { return .failed(message: "Not signed in.", fields: [:]) }
        pending = true
        defer { pending = false }
        do {
            adopt(try await call(api))
            return .done
        } catch APIError.unauthorized {
            signOut()
            return .failed(message: APIError.unauthorized.localizedDescription, fields: [:])
        } catch {
            if let fresh = try? await api.tournament(id: id) { adopt(fresh) }
            var fields: [String: String] = [:]
            if case APIError.invalid(_, _, let f) = error { fields = f }
            let message = error.localizedDescription
            if !inline { foot.fail(message, retry: { Task { await self.run(call) } }) }
            return .failed(message: message, fields: fields)
        }
    }
}
