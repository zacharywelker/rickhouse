import SwiftUI

/// The Labels tab, in two parts chosen by a segmented control: the tasting history (the default) and a search for labels.
/// Both kinds of row open the label's page.
struct LabelsView: View {
    private enum Mode: String, CaseIterable, Identifiable {
        case tastings = "Tastings", find = "Find a label"
        var id: String { rawValue }
    }

    @Environment(Session.self) private var session
    /// Bumped by the shell after a tasting is logged, so the history reloads.
    var reloadSignal = 0

    @State private var mode = Mode.tastings
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
    @State private var deletingTasting: Int?
    /// The name typed in the search, while its new label is being made; and the label to show once it is.
    @State private var creating: NewLabelStart?
    @State private var openedLabel: Int?

    private struct NewLabelStart: Hashable { let name: String }

    private var searching: Bool { mode == .find && !query.trimmingCharacters(in: .whitespaces).isEmpty }

    /// The history in the order it came, cut into months.
    private var months: [(title: String, entries: [TastingEntry])] {
        var out: [(title: String, entries: [TastingEntry])] = []
        for entry in history {
            let title = Format.month(entry.tastedOn)
            if out.last?.title == title { out[out.count - 1].entries.append(entry) } else { out.append((title, [entry])) }
        }
        return out
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Show", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                if mode == .find { SearchField(prompt: "Brand or name", text: $query) }

                List {
                    switch mode {
                    case .tastings:
                        ForEach(months, id: \.title) { month in
                            Section {
                                ForEach(month.entries) { entry in
                                    NavigationLink { LabelPage(id: entry.expressionId) } label: { TastingRow(entry: entry) }
                                        .listRowBackground(Theme.paper)
                                        .swipeActions(edge: .trailing) {
                                            Button("Delete", role: .destructive) { deletingTasting = entry.id }
                                        }
                                        .contextMenu { Button("Delete", systemImage: "trash", role: .destructive) { deletingTasting = entry.id } }
                                        .task { if entry.id == history.last?.id { await loadMoreHistory() } }
                                }
                            } header: {
                                Text(month.title)
                                    .font(.inter(12, .semibold, relativeTo: .caption))
                                    .textCase(.uppercase)
                                    .tracking(0.8)
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                    case .find:
                        ForEach(results) { label in
                            NavigationLink { LabelPage(id: label.id) } label: { LabelRow(label: label) }
                                .listRowBackground(Theme.paper)
                        }
                        if searching && searched && !results.isEmpty {
                            createButton.listRowBackground(Theme.paper)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .overlay { stateOverlay }
            }
            .background(Theme.paper)
            .navigationTitle("Labels")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $creating) { start in
                NewLabelView(code: nil, name: start.name) { label in
                    creating = nil
                    openedLabel = label.id
                }
            }
            .navigationDestination(item: $openedLabel) { LabelPage(id: $0) }
            .task(id: query) { await search() }
            .task(id: attempt) { await reloadHistory() }
            .task { await session.loadWheels() }
            .confirmsTastingDeletion($deletingTasting) { id in history.removeAll { $0.id == id } }
            .onChange(of: reloadSignal) { attempt += 1 }
            .refreshable { if mode == .tastings { await reloadHistory() } }
        }
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if mode == .find {
            if !searching {
                ContentUnavailableView("Find a label", systemImage: "text.magnifyingglass", description: Text("Type a brand or name to open its page."))
            } else if let searchFailure {
                ContentUnavailableView("Couldn't search", systemImage: "wifi.slash", description: Text(searchFailure))
            } else if results.isEmpty && searched {
                ContentUnavailableView {
                    Label("No label found", systemImage: "magnifyingglass")
                } description: {
                    Text("Nothing matches that search.")
                } actions: {
                    createButton
                }
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
                description: Text("Log a tasting with the + tab, or find a label to see what you have written about it.")
            )
        }
    }

    /// Starts a new label from what was typed, for a bottle the search can't find.
    private var createButton: some View {
        Button {
            creating = NewLabelStart(name: query.trimmingCharacters(in: .whitespaces))
        } label: {
            Label("Create a new label", systemImage: "plus")
                .font(.inter(16, .semibold, relativeTo: .headline))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.plain)
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
            LabelThumb(path: label.thumbPath, category: label.category)
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
        .frame(minHeight: 60)
        .accessibilityElement(children: .combine)
    }
}

/// One tasting in the history: the photo, the label, when and where, one line of flavors, and the score large at the right.
struct TastingRow: View {
    @Environment(Session.self) private var session
    let entry: TastingEntry

    var body: some View {
        HStack(spacing: 12) {
            LabelThumb(path: entry.thumbPath, category: entry.category)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title).font(.inter(16, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink).lineLimit(1)
                Text([Format.day(entry.tastedOn), sourceName].compactMap { $0 }.joined(separator: " · "))
                    .font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted).monospacedDigit().lineLimit(1)
                if let flavors = entry.tags, !flavors.isEmpty {
                    Text(flavors.map(session.flavorName).joined(separator: ", "))
                        .font(.inter(13, .medium, relativeTo: .footnote)).foregroundStyle(Theme.ink).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            TastingScore(rating: entry.rating)
        }
        .frame(minHeight: 60)
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    /// "Bottle share" or "Owned"; a place, when there is one, is on the label page.
    private var sourceName: String? {
        entry.source.flatMap(TastingSource.init(rawValue:))?.title
    }
}
