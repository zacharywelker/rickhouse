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
    @State private var adding = false

    var body: some View {
        List {
            if let error {
                Text(error).foregroundStyle(.red)
            }
            ForEach(bottles) { bottle in
                NavigationLink(value: bottle) { BottleRow(bottle: bottle) }
                    .task { if bottle.id == bottles.last?.id { await loadMore() } }
            }
        }
        .listStyle(.plain)
        .overlay {
            if bottles.isEmpty && !loading && error == nil {
                ContentUnavailableView(query.isEmpty ? "No bottles yet" : "No matches",
                                       systemImage: "wineglass",
                                       description: Text(query.isEmpty ? "Tap + to add your first bottle." : "Try a different search."))
            }
        }
        .navigationTitle(total > 0 ? "Collection · \(total)" : "Collection")
        .navigationDestination(for: BottleSummary.self) { BottleDetailView(id: $0.id) }
        .searchable(text: $query, prompt: "Search bottles")
        .task(id: query) {
            // Debounce typing; .task(id:) cancels the previous run.
            try? await Task.sleep(for: .milliseconds(250))
            if !Task.isCancelled { await reload() }
        }
        .refreshable { await reload() }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    if let user = session.user { Text(user.name) }
                    Button("Sign out", role: .destructive) { session.signOut() }
                } label: { Image(systemName: "person.crop.circle") }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $adding) {
            AddBottleView { Task { await reload() } }
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

struct BottleRow: View {
    let bottle: BottleSummary

    var body: some View {
        HStack(spacing: 12) {
            AuthenticatedImage(path: bottle.thumbPath)
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 2) {
                Text(bottle.brand).font(.caption).foregroundStyle(.secondary)
                Text(bottle.name).font(.headline)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            FillBar(percent: bottle.fillPct)
                .frame(width: 8, height: 40)
        }
    }

    private var subtitle: String {
        var parts = [bottle.category]
        if let proof = bottle.proof, let value = Double(proof) { parts.append("\(value.formatted()) proof") }
        if let age = bottle.ageStatement, !age.isEmpty { parts.append(age) }
        return parts.joined(separator: " · ")
    }
}

/// A thin vertical gauge, full at the bottom up.
struct FillBar: View {
    let percent: Int

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 3).fill(Color(.secondarySystemFill))
                RoundedRectangle(cornerRadius: 3).fill(.orange)
                    .frame(height: geo.size.height * CGFloat(max(0, min(100, percent))) / 100)
            }
        }
        .accessibilityLabel("\(percent) percent full")
    }
}
