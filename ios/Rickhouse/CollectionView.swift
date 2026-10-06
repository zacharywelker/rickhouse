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
    /// Bumped by the shell after a bottle is added, so the list reloads.
    var reloadSignal = 0
    @AppStorage("gridColumns") private var gridColumns = 3
    @AppStorage("inDepthView") private var inDepth = false

    var body: some View {
        Group {
            if inDepth { inDepthList } else { gallery }
        }
        .overlay {
            if bottles.isEmpty && !loading && error == nil {
                ContentUnavailableView(query.isEmpty ? "No bottles yet" : "No matches",
                                       systemImage: "wineglass",
                                       description: Text(query.isEmpty ? "Tap + to add your first bottle." : "Try a different search."))
            }
        }
        .overlay(alignment: .bottomTrailing) { inDepthToggle }
        .background(Theme.paper)
        .toolbarBackground(Theme.paper, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: BottleSummary.self) { BottleDetailView(id: $0.id) }
        .searchable(text: $query, prompt: "Search bottles")
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
        let columns = gridColumns == 2 ? 2 : 3
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                headline
                if let error {
                    Text(error).font(.inter(14)).foregroundStyle(.red)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10, alignment: .top), count: columns),
                          alignment: .leading, spacing: 16) {
                    ForEach(bottles) { bottle in
                        NavigationLink(value: bottle) { BottleCard(bottle: bottle, factCount: columns == 2 ? 2 : 1) }
                            .buttonStyle(.plain)
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
            if let error {
                Text(error).foregroundStyle(.red)
            }
            ForEach(bottles) { bottle in
                NavigationLink(value: bottle) { BottleRow(bottle: bottle) }
                    .listRowBackground(Theme.paper)
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
                HStack(spacing: 5) {
                    Rectangle().fill(CategoryPalette.color(for: bottle.category))
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .frame(width: 9, height: 9)
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
