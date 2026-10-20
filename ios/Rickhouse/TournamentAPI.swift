import Foundation

/// The tournaments endpoints (ios/README.md has the table). Errors surface through `APIError` as everywhere else:
/// a 409 `conflict` and a 404 become `.server(message)`, a 422 `invalid` becomes `.invalid` with its fields, and every
/// message is written for the screen, so no tournament case was added.
extension APIClient {
    private static let nothing: [String: Any] = [:]

    private struct Created: Decodable { let id: Int }

    func tournaments() async throws -> [TournamentSummary] {
        try await get("api/v1/tournaments", as: TournamentList.self).tournaments
    }

    /// Makes a draft and answers its id.
    func createTournament(_ body: NewTournament) async throws -> Int {
        try await sendJSON("POST", "api/v1/tournaments", body: body, as: Created.self).id
    }

    func tournament(id: Int) async throws -> TournamentView {
        try await get("api/v1/tournaments/\(id)", as: TournamentView.self)
    }

    func patchTournament(id: Int, _ patch: TournamentPatch) async throws -> TournamentView {
        try await sendObject("PATCH", "api/v1/tournaments/\(id)", json: patch.json, as: TournamentView.self)
    }

    /// A draft or a finished one; a running one is a 409.
    func deleteTournament(id: Int) async throws { try await delete("api/v1/tournaments/\(id)") }

    func startTournament(id: Int) async throws -> TournamentView {
        try await sendObject("POST", "api/v1/tournaments/\(id)/start", json: Self.nothing, as: TournamentView.self)
    }

    func resetTournament(id: Int) async throws -> TournamentView {
        try await sendObject("POST", "api/v1/tournaments/\(id)/reset", json: Self.nothing, as: TournamentView.self)
    }

    /// For the pourer: a random pending flight of the current round, or the one named.
    func drawFlight(tournamentId: Int, heatId: Int? = nil) async throws -> DrawnHeat {
        var body = Self.nothing
        if let heatId { body["heatId"] = heatId }
        return try await sendObject("POST", "api/v1/tournaments/\(tournamentId)/draw", json: body, as: DrawnHeat.self)
    }

    /// Names a flight; nil clears the name (sent as JSON null).
    func renameFlight(tournamentId: Int, heatId: Int, label: String?) async throws -> TournamentView {
        try await sendObject("PATCH", "api/v1/tournaments/\(tournamentId)/heats/\(heatId)", json: ["label": label ?? NSNull()], as: TournamentView.self)
    }

    /// Records a flight with the entries best first.
    func recordFlight(tournamentId: Int, heatId: Int, ranking: [Int]) async throws -> TournamentView {
        try await sendObject("POST", resultPath(tournamentId, heatId), json: ["ranking": ranking], as: TournamentView.self)
    }

    /// Records a flight poured blind, the glass letters best first.
    func recordFlight(tournamentId: Int, heatId: Int, glasses: [String]) async throws -> TournamentView {
        try await sendObject("POST", resultPath(tournamentId, heatId), json: ["glasses": glasses], as: TournamentView.self)
    }

    /// Takes a result back (until a flight of the next round has one).
    func undoFlight(tournamentId: Int, heatId: Int) async throws -> TournamentView {
        try await sendBodiless("DELETE", resultPath(tournamentId, heatId), as: TournamentView.self)
    }

    /// Which glass letter each entry of a flight is poured into.
    func setGlasses(tournamentId: Int, heatId: Int, assign: [(entryId: Int, glass: String)]) async throws -> TournamentView {
        let rows = assign.map { ["entryId": $0.entryId, "glass": $0.glass] as [String: Any] }
        return try await sendObject("PUT", "api/v1/tournaments/\(tournamentId)/heats/\(heatId)/glass", json: ["assign": rows], as: TournamentView.self)
    }

    func moveEntry(tournamentId: Int, entryId: Int, toHeatId: Int) async throws -> TournamentView {
        try await sendObject("POST", entryPath(tournamentId, entryId, "move"), json: ["toHeatId": toHeatId], as: TournamentView.self)
    }

    func swapEntries(tournamentId: Int, entryId: Int, withEntryId: Int) async throws -> TournamentView {
        try await sendObject("POST", entryPath(tournamentId, entryId, "swap"), json: ["withEntryId": withEntryId], as: TournamentView.self)
    }

    func withdrawEntry(tournamentId: Int, entryId: Int) async throws -> TournamentView {
        try await sendObject("POST", entryPath(tournamentId, entryId, "withdraw"), json: Self.nothing, as: TournamentView.self)
    }

    /// Takes a bottle out of a draft (no body); the others keep their flights. A started tournament is a 409.
    func removeEntry(tournamentId: Int, entryId: Int) async throws -> TournamentView {
        try await sendBodiless("DELETE", "api/v1/tournaments/\(tournamentId)/entries/\(entryId)", as: TournamentView.self)
    }

    /// Moves a flight to place `toSlot` among its round's flights (a draft, or an undecided flight of the current round).
    func moveFlight(tournamentId: Int, heatId: Int, toSlot: Int) async throws -> TournamentView {
        try await sendObject("POST", "api/v1/tournaments/\(tournamentId)/heats/\(heatId)/move", json: ["toSlot": toSlot], as: TournamentView.self)
    }

    /// Matches an outside entry to one of your bottles.
    func promoteEntry(tournamentId: Int, entryId: Int, bottleId: Int) async throws -> TournamentView {
        try await sendObject("PATCH", "api/v1/tournaments/\(tournamentId)/entries/\(entryId)", json: ["bottleId": bottleId], as: TournamentView.self)
    }

    /// Matches an outside entry to one of your labels.
    func promoteEntry(tournamentId: Int, entryId: Int, expressionId: Int) async throws -> TournamentView {
        try await sendObject("PATCH", "api/v1/tournaments/\(tournamentId)/entries/\(entryId)", json: ["expressionId": expressionId], as: TournamentView.self)
    }

    func tournamentRanking(categoryId: Int? = nil) async throws -> RankingResult {
        let query = categoryId.map { [URLQueryItem(name: "categoryId", value: String($0))] } ?? []
        return try await get("api/v1/tournaments/ranking", query: query, as: RankingResult.self)
    }

    func fieldCandidates(_ filters: FieldFilters) async throws -> FieldPage {
        try await get("api/v1/tournaments/field", query: filters.queryItems, as: FieldPage.self)
    }

    func labelCandidates(matching q: String) async throws -> [LabelCandidate] {
        try await get("api/v1/tournaments/field/labels", query: [.init(name: "q", value: q)], as: LabelCandidates.self).rows
    }

    private func resultPath(_ tournamentId: Int, _ heatId: Int) -> String { "api/v1/tournaments/\(tournamentId)/heats/\(heatId)/result" }
    private func entryPath(_ tournamentId: Int, _ entryId: Int, _ action: String) -> String { "api/v1/tournaments/\(tournamentId)/entries/\(entryId)/\(action)" }
}
