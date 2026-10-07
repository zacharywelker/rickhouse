import SwiftUI

/// The Labels tab: a search bar for labels on top and, below it, the tasting history.
/// While there is text in the bar the list is the matching labels; clearing it brings the history back.
/// Both kinds of row open the label's page.
struct LabelsView: View {
    @Environment(Session.self) private var session

    @State private var query = ""
    @State private var results: [LabelOption] = []
    @State private var searched = false
    @State private var searchFailure: String?

    @State private var history: [TastingEntry] = []
    @State private var historyPage = 1
    @State private var historyPageCount = 1
    @State private var historyLoaded = false
    @State private var loadingHistory = false
    @State private var historyFailure: String?
    @State private var attempt = 0

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            List {
                if searching {
                    ForEach(results) { label in
                        NavigationLink { LabelPage(id: label.id) } label: { LabelRow(label: label) }
                            .listRowBackground(Theme.paper)
                    }
                } else {
                    ForEach(history) { entry in
                        NavigationLink { LabelPage(id: entry.expressionId) } label: { TastingRow(entry: entry) }
                            .listRowBackground(Theme.paper)
                            .task { if entry.id == history.last?.id { await loadMoreHistory() } }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .overlay { stateOverlay }
            .navigationTitle("Labels")
            .searchable(text: $query, prompt: "Search labels")
            .task(id: query) { await search() }
            .task(id: attempt) { await reloadHistory() }
            .refreshable { await reloadHistory() }
        }
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if searching {
            if let searchFailure {
                ContentUnavailableView("Couldn't search", systemImage: "wifi.slash", description: Text(searchFailure))
            } else if results.isEmpty && searched {
                ContentUnavailableView("No label found", systemImage: "magnifyingglass", description: Text("Nothing matches that search."))
            }
        } else if let historyFailure, history.isEmpty {
            ContentUnavailableView {
                Label("Couldn't load tastings", systemImage: "wifi.slash")
            } description: {
                Text(historyFailure)
            } actions: {
                Button("Try again") { attempt += 1 }
            }
        } else if !historyLoaded {
            ProgressView()
        } else if history.isEmpty {
            ContentUnavailableView(
                "No tastings yet",
                systemImage: "wineglass",
                description: Text("Tasting notes you add to your bottles show up here. Search above to find a label.")
            )
        }
    }

    // MARK: Loading

    private func search() async {
        guard searching else {
            results = []
            searched = false
            searchFailure = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled, let api = session.api else { return }
        do {
            results = try await api.labels(matching: query)
            searchFailure = nil
            searched = true
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            // A newer keystroke cancels this request; that isn't a failure.
            guard !Task.isCancelled else { return }
            results = []
            searchFailure = error.localizedDescription
        }
    }

    private func reloadHistory() async {
        historyPage = 1
        await fetchHistory(replacing: true)
    }

    private func loadMoreHistory() async {
        guard !loadingHistory, historyPage < historyPageCount else { return }
        historyPage += 1
        // A failed page must be asked for again, not skipped.
        if !(await fetchHistory(replacing: false)) { historyPage -= 1 }
    }

    @discardableResult
    private func fetchHistory(replacing: Bool) async -> Bool {
        guard let api = session.api else { return false }
        loadingHistory = true
        defer { loadingHistory = false }
        do {
            let page = try await api.tastings(page: historyPage)
            history = replacing ? page.tastings : history + page.tastings
            historyPageCount = page.pageCount
            historyLoaded = true
            historyFailure = nil
            return true
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            if !(error is CancellationError) { historyFailure = error.localizedDescription }
        }
        return false
    }
}

/// A label in the search results.
struct LabelRow: View {
    let label: LabelOption

    var body: some View {
        HStack(spacing: 12) {
            AuthenticatedImage(path: label.thumbPath, contentMode: .fit, background: CategoryPalette.color(for: label.category))
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            VStack(alignment: .leading, spacing: 2) {
                Text(label.brand).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                Text(label.name).font(.inter(16, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                HStack(spacing: 4) {
                    Rectangle().fill(CategoryPalette.color(for: label.category))
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    Text([label.category, Format.proof(label.proof)].compactMap { $0 }.joined(separator: " · "))
                        .font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }
}

/// One tasting in the history: when, how it rated, and the first line of what was written.
struct TastingRow: View {
    let entry: TastingEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AuthenticatedImage(path: entry.thumbPath, contentMode: .fit, background: CategoryPalette.color(for: entry.category))
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.title).font(.inter(16, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                Text([Format.day(entry.tastedOn), Format.rating(entry.rating)].compactMap { $0 }.joined(separator: " · "))
                    .font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted).monospacedDigit()
                if let summary = entry.summary {
                    Text(summary).font(.inter(14, relativeTo: .subheadline)).foregroundStyle(Theme.ink).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
