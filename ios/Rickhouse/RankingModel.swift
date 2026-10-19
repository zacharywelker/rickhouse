import Foundation

/// The ranking and audit screen: loads the pooled ranking for one category (or all), and keeps what is on screen true to
/// the category named. A failed first load is `loadError`; a later failure keeps the page and offers Retry on the foot bar.
@MainActor @Observable
final class RankingModel {
    enum Tab: String, CaseIterable, Identifiable {
        case ranking = "Ranking", audit = "Audit"
        var id: String { rawValue }
    }

    private(set) var result: RankingResult?
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    private(set) var loading = false
    var tab: Tab = .ranking
    var categories: [CategoryOption] = []
    var categoryId: Int?
    let foot = FootBar()

    @ObservationIgnored var api: () -> APIClient? = { nil }
    @ObservationIgnored var signOut: () -> Void = {}

    init(categoryId: Int? = nil) { self.categoryId = categoryId }

    var sections: [RankingSection] { result.map(TournamentRankingModel.rankingSections) ?? [] }
    var auditLines: [AuditLine] { result.map(TournamentRankingModel.auditLines) ?? [] }
    var auditNote: String? { result.flatMap(TournamentRankingModel.auditNote) }
    /// nil until the first fetch finishes, so nothing says "No …" before it knows.
    var empty: RankingEmpty? { result.flatMap(TournamentRankingModel.rankingEmpty) }

    var subtitle: String {
        guard let result else { return "" }
        return result.competitors.isEmpty ? "Every finished flight of every tournament, pooled."
            : "\(result.competitors.count) ranked from every finished flight of every tournament."
    }

    var noFlightsText: String {
        categoryId == nil ? "No decided flights yet. Play a tournament to build a ranking." : "No decided flights in this category yet."
    }

    var categoryName: String { categories.first { $0.id == categoryId }?.name ?? (categoryId == nil ? "All categories" : "This category") }
    var categoryOptions: [PickerOption] { [PickerOption(id: "", title: "All categories")] + categories.map { PickerOption(id: String($0.id), title: $0.name) } }

    /// Loads (or reloads) the ranking for `categoryId`, and the category list once.
    func load() async {
        guard let api = api() else { return }
        loading = true
        defer { loading = false }
        if categories.isEmpty, let all = try? await api.categories() { categories = all }
        let asked = categoryId
        do {
            let next = try await api.tournamentRanking(categoryId: asked)
            guard asked == categoryId else { return }  // the person moved on while this was in flight
            result = next
            hasLoaded = true
            loadError = nil
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if hasLoaded { foot.fail(error, retry: { Task { await self.load() } }) } else { loadError = error.localizedDescription }
        }
    }

    /// Switches category. If the new ranking cannot be had, the old category stays, so the rows and the filter agree.
    func choose(categoryId next: Int?) async {
        guard next != categoryId else { return }
        let before = categoryId
        categoryId = next
        guard hasLoaded else { await load(); return }
        guard let api = api() else { return }
        do {
            let fresh = try await api.tournamentRanking(categoryId: next)
            guard categoryId == next else { return }
            result = fresh
            foot.dismissFailure()
        } catch APIError.unauthorized {
            signOut()
        } catch {
            categoryId = before
            foot.fail(error, retry: { Task { await self.choose(categoryId: next) } })
        }
    }
}
