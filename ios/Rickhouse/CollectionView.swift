import SwiftUI

struct CollectionView: View {
    @Environment(Session.self) private var session
    @State private var bottles: [BottleSummary] = []
    @State private var total = 0
    @State private var page = 1
    @State private var pageCount = 1
    @State private var query = ""
    @State private var loading = false
    @State private var error: String?
    /// False until the first fetch succeeds, so the screen never claims "0 bottles" or "No bottles yet" early.
    @State private var hasLoaded = false
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Bumped by the shell after a bottle is added, so the list reloads.
    var reloadSignal = 0
    @AppStorage("gridColumns") private var gridColumns = 3
    @AppStorage("inDepthView") private var inDepth = false
    @State private var deleting: BottleSummary?
    @State private var confirmingDelete = false
    @State private var openedBottle: BottleSummary?
    @State private var openedLabel: Int?
    @State private var logging: LogTarget?
    @State private var problem: String?

    private struct LogTarget: Identifiable {
        let id = UUID()
        let label: TastingLabel
        let bottle: TastingBottle
    }

    var body: some View {
        VStack(spacing: 0) {
            SearchField(prompt: "Search bottles", text: $query)
            if inDepth { inDepthList } else { gallery }
        }
        .overlay {
            if bottles.isEmpty {
                if let error {
                    ContentUnavailableView {
                        Label("Couldn't load bottles", systemImage: "wifi.slash")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try again") { Task { await reload() } }
                    }
                } else if !hasLoaded {
                    ProgressView()
                } else {
                    ContentUnavailableView(query.isEmpty ? "No bottles yet" : "No matches",
                                           systemImage: "wineglass",
                                           description: Text(query.isEmpty ? "Tap + to add your first bottle." : "Try a different search."))
                }
            }
        }
        .overlay(alignment: .bottomTrailing) { inDepthToggle }
        .background(Theme.paper)
        .toolbarVisibility(.hidden, for: .navigationBar)  // the bar would be empty: no title, and search is in the page
        .navigationDestination(for: BottleSummary.self) { bottle in
            BottleDetailView(id: bottle.id, onChanged: { Task { await reload() } })
        }
        .navigationDestination(item: $openedBottle) { bottle in
            BottleDetailView(id: bottle.id, onChanged: { Task { await reload() } })
        }
        .navigationDestination(item: $openedLabel) { LabelPage(id: $0) }
        .confirmSheet("Delete this bottle?", message: deleteMessage, confirm: "Delete bottle", isPresented: $confirmingDelete) {
            if let bottle = deleting { delete(bottle) }
        }
        .sheet(item: $logging) { target in
            NavigationStack {
                TastingFormView(label: target.label, bottle: target.bottle) { logging = nil; Task { await reload() } }
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { logging = nil } } }
            }
        }
        .alert("Something went wrong", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(problem ?? "")
        }
        .task(id: query) {
            // Debounce typing; .task(id:) cancels the previous run.
            try? await Task.sleep(for: .milliseconds(250))
            if !Task.isCancelled { await reload() }
        }
        .onChange(of: reloadSignal) { Task { await reload() } }
        .refreshable { await reload() }
    }

    /// The gallery: the headline scrolls away with the bottles.
    private var gallery: some View {
        // At accessibility text sizes three narrow columns truncate every fact, so go to one.
        let columns = typeSize.isAccessibilitySize ? 1 : gridColumns == 2 ? 2 : 3
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if hasLoaded { headline }
                if let error, !bottles.isEmpty {
                    ErrorText(error)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: columns),
                          alignment: .leading, spacing: 16) {
                    ForEach(bottles) { bottle in
                        NavigationLink(value: bottle) { BottleCard(bottle: bottle, factCount: columns == 3 ? 1 : 2) }
                            .buttonStyle(.plain)
                            .contextMenu { menu(for: bottle) }
                            .task { if bottle.id == bottles.last?.id { await loadMore() } }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 80)  // clear of the in-depth button
        }
    }

    private var headline: some View {
        Text(total == 1 ? "1 bottle" : "\(total) bottles")
            .font(.headline())
            .foregroundStyle(Theme.ink)
    }

    private var inDepthList: some View {
        List {
            if let error, !bottles.isEmpty {
                ErrorText(error)
            }
            ForEach(bottles) { bottle in
                NavigationLink(value: bottle) { BottleRow(bottle: bottle) }
                    .listRowBackground(Theme.paper)
                    .swipeActions(edge: .trailing) {
                        Button("Delete", role: .destructive) { ask(bottle) }
                    }
                    .contextMenu { menu(for: bottle) }
                    .task { if bottle.id == bottles.last?.id { await loadMore() } }
            }
            Color.clear.frame(height: 56).listRowSeparator(.hidden).listRowBackground(Theme.paper)  // clear of the in-depth button
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private var inDepthToggle: some View {
        Button { inDepth.toggle() } label: {
            Image(systemName: inDepth ? "square.grid.2x2" : "tablecells")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Theme.ink)
                .frame(width: 44, height: 44)
                .background(Theme.paper, in: Circle())
                .overlay(Circle().strokeBorder(Theme.ink, lineWidth: 1))
        }
        .accessibilityLabel(inDepth ? "Gallery view" : "In-depth view")
        .padding(16)
    }

    // MARK: Bottle actions

    /// What long-pressing a bottle offers, like an app icon on the home screen.
    @ViewBuilder
    private func menu(for bottle: BottleSummary) -> some View {
        Button("Log a tasting", systemImage: "wineglass") { startLog(bottle) }
        Button("View bottle", systemImage: "books.vertical") { openedBottle = bottle }
        if let labelId = bottle.expressionId {
            Button("View label", systemImage: "tag") { openedLabel = labelId }
        }
        Divider()
        Button("Delete this bottle", systemImage: "trash", role: .destructive) { ask(bottle) }
    }

    private var deleteMessage: String {
        guard let deleting else { return "This can't be undone." }
        return "\(deleting.brand) \(deleting.name) and its photos are removed. Tastings you logged stay on the label."
    }

    private func ask(_ bottle: BottleSummary) {
        deleting = bottle
        confirmingDelete = true
    }

    private func delete(_ bottle: BottleSummary) {
        guard let api = session.api else { return }
        Task {
            do {
                try await api.deleteBottle(id: bottle.id)
                bottles.removeAll { $0.id == bottle.id }
                total = max(0, total - 1)
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func startLog(_ bottle: BottleSummary) {
        guard let api = session.api else { return }
        Task {
            do {
                // The bottle page knows the label's flavor wheel, which a tasting needs.
                let detail = try await api.bottle(id: bottle.id)
                await session.loadWheels()
                logging = LogTarget(
                    label: TastingLabel(id: detail.expressionId ?? bottle.expressionId ?? 0, title: "\(bottle.brand) \(bottle.name)", category: bottle.category, wheel: detail.wheel),
                    bottle: TastingBottle(id: bottle.id, title: "\(bottle.brand) \(bottle.name)")
                )
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func reload() async {
        page = 1
        await fetch(replacing: true)
    }

    private func loadMore() async {
        guard !loading, page < pageCount else { return }
        page += 1
        // A failed page must be asked for again, not skipped.
        if !(await fetch(replacing: false)) { page -= 1 }
    }

    /// Whether the page arrived.
    @discardableResult
    private func fetch(replacing: Bool) async -> Bool {
        guard let api = session.api else { return false }
        loading = true
        defer { loading = false }
        do {
            let result = try await api.bottles(query: query, status: nil, page: page)
            bottles = replacing ? result.bottles : bottles + result.bottles
            total = result.total
            pageCount = result.pageCount
            hasLoaded = true
            error = nil
            return true
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            if !(error is CancellationError) { self.error = error.localizedDescription }
        }
        return false
    }
}

/// One line per bottle, for the in-depth view.
struct BottleRow: View {
    let bottle: BottleSummary

    var body: some View {
        HStack(spacing: 12) {
            AuthenticatedImage(path: bottle.thumbPath, contentMode: .fit, background: CategoryPalette.color(for: bottle.category))
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            VStack(alignment: .leading, spacing: 2) {
                Text(bottle.brand).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                Text(bottle.name).font(.inter(16, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                HStack(spacing: 4) {
                    Rectangle().fill(CategoryPalette.color(for: bottle.category))
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    Text(subtitle).font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted).monospacedDigit()
                }
            }
            Spacer()
            FillGauge(percent: bottle.fillPct, track: Theme.ink.opacity(0.15))
                .frame(width: 4, height: 40)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(bottle.brand) \(bottle.name), \(subtitle), \(bottle.fillPct) percent full")
    }

    private var subtitle: String {
        var parts = [bottle.category]
        if let proof = bottle.proof, let value = Double(proof) { parts.append("\(value.formatted()) proof") }
        if let age = bottle.ageStatement, !age.isEmpty { parts.append(age) }
        return parts.joined(separator: " · ")
    }
}
