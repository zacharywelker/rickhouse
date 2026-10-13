import SwiftUI

/// The Labels tab, in two parts chosen by a segmented control: the tasting history (the default) and an index of every
/// label of yours, A to Z by brand, that the search above it filters. Both kinds of row open the label's page.
struct LabelsView: View {
    private enum Mode: String, CaseIterable, Identifiable {
        case tastings = "Tastings", labels = "Labels"
        var id: String { rawValue }
    }

    @Environment(Session.self) private var session
    /// Bumped by the shell after a tasting is logged, so the history reloads.
    var reloadSignal = 0

    @State private var mode = Mode.tastings
    @State private var foot = FootBar()
    @State private var query = ""
    @State private var index: [LabelIndexEntry] = []
    @State private var indexLoaded = false
    @State private var indexFailure: String?

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

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }

    /// The index after the search, cut into brands. Brands are already in order; a brand's labels stay together.
    private var brands: [(brand: String, labels: [LabelIndexEntry])] {
        var out: [(brand: String, labels: [LabelIndexEntry])] = []
        for label in index where trimmedQuery.isEmpty || label.matches(trimmedQuery) {
            if out.last?.brand.localizedCaseInsensitiveCompare(label.brand) == .orderedSame {
                out[out.count - 1].labels.append(label)
            } else {
                out.append((label.brand, [label]))
            }
        }
        return out
    }

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

                if mode == .labels { SearchField(prompt: "Search your labels", text: $query) }

                List {
                    switch mode {
                    case .tastings:
                        ForEach(months, id: \.title) { month in
                            Section {
                                ForEach(month.entries) { entry in
                                    NavigationLink { LabelPage(id: entry.expressionId) } label: { TastingRow(entry: entry) }
                                        .listRowBackground(Theme.paper)
                                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                            Button("Delete") { deletingTasting = entry.id }.tint(Theme.error)
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
                    case .labels:
                        ForEach(brands, id: \.brand) { group in
                            Section {
                                ForEach(group.labels) { label in
                                    NavigationLink { LabelPage(id: label.id) } label: { LabelIndexRow(label: label) }
                                        .listRowBackground(Theme.paper)
                                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                                }
                            } header: {
                                Text(group.brand)
                                    .font(.inter(12, .semibold, relativeTo: .caption))
                                    .textCase(.uppercase)
                                    .tracking(0.8)
                                    .foregroundStyle(Theme.muted)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 5)
                                    .background(Theme.ink.opacity(0.07))
                                    .listRowInsets(EdgeInsets())
                                    .accessibilityAddTraits(.isHeader)
                            }
                            .sectionIndexLabel(String(group.brand.prefix(1)).uppercased())
                        }
                        if !trimmedQuery.isEmpty && !brands.isEmpty {
                            createButton.listRowBackground(Theme.paper)
                        }
                    }
                }
                .listStyle(.plain)
                .listSectionIndexVisibility(mode == .labels && trimmedQuery.isEmpty ? .visible : .hidden)
                .listSectionSpacing(0)
                .environment(\.defaultMinListHeaderHeight, mode == .labels ? 0 : nil)
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
            .task(id: attempt) { await reloadHistory() }
            .task(id: "\(mode)#\(attempt)") { if mode == .labels { await loadIndex() } }
            .task { await session.loadWheels() }
            .confirmsTastingDeletion($deletingTasting, foot: foot) { id in history.removeAll { $0.id == id } }
            .footBar(foot)
            .onChange(of: reloadSignal) { attempt += 1 }
            .refreshable { if mode == .tastings { await reloadHistory() } else { await loadIndex() } }
        }
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if mode == .labels {
            if let indexFailure, index.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load labels", systemImage: "wifi.slash")
                } description: {
                    Text(indexFailure)
                } actions: {
                    Button("Try again") { attempt += 1 }
                }
            } else if !indexLoaded {
                ProgressView()
            } else if brands.isEmpty {
                ContentUnavailableView {
                    Label(trimmedQuery.isEmpty ? "No labels yet" : "No label found", systemImage: "magnifyingglass")
                } description: {
                    Text(trimmedQuery.isEmpty ? "Add a bottle or log a tasting with the + tab." : "Nothing of yours matches that search.")
                } actions: {
                    if !trimmedQuery.isEmpty { createButton }
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
            creating = NewLabelStart(name: trimmedQuery)
        } label: {
            Label("New label \u{201C}\(trimmedQuery)\u{201D}", systemImage: "plus")
                .font(.inter(16, .semibold, relativeTo: .headline))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    // MARK: Loading

    private func loadIndex() async {
        guard let api = session.api else { return }
        do {
            index = try await api.labelIndex()
            indexLoaded = true
            indexFailure = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            if !(error is CancellationError) { indexFailure = error.localizedDescription }
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

/// One line of the Labels index: the name with a boxed count of bottles you own, the proof, and your average.
/// No photo and no large score, so it never reads as the tasting history.
struct LabelIndexRow: View {
    let label: LabelIndexEntry

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(label.name).font(.inter(16, .medium, relativeTo: .body)).foregroundStyle(Theme.ink).lineLimit(1)
                if label.bottleCount > 0 {
                    Text("\(label.bottleCount)")
                        .font(.inter(11, .semibold, relativeTo: .caption2)).monospacedDigit()
                        .padding(.horizontal, 4)
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .foregroundStyle(Theme.ink)
                        .layoutPriority(1)
                }
            }
            Spacer(minLength: 8)
            Text(Format.proof(label.proof) ?? "")
                .font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted).monospacedDigit()
            Text(Format.score(label.averageRating) ?? "–")
                .font(.inter(16, label.averageRating == nil ? .regular : .semibold, relativeTo: .body)).monospacedDigit()
                .foregroundStyle(label.averageRating == nil ? Theme.muted : Theme.ink)
                .frame(minWidth: 32, alignment: .trailing)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    private var spoken: String {
        var parts = [label.name]
        if let proof = Format.proof(label.proof) { parts.append(proof) }
        if label.bottleCount > 0 { parts.append(label.bottleCount == 1 ? "1 bottle" : "\(label.bottleCount) bottles") }
        if let score = Format.score(label.averageRating) {
            parts.append("average \(score) of \(label.tastingCount) \(label.tastingCount == 1 ? "tasting" : "tastings")")
        } else if label.tastingCount == 0 {
            parts.append("no tastings")
        }
        return parts.joined(separator: ", ")
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
