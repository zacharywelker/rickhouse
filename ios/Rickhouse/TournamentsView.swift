import SwiftUI

/// Account, Tournaments: every tournament, newest first, with a progress bar for the ones being played. New makes a
/// draft; a draft or finished one can be deleted by swipe.
struct TournamentsView: View {
    @Environment(Session.self) private var session

    @State private var summaries: [TournamentSummary] = []
    @State private var hasLoaded = false
    @State private var error: String?
    @State private var foot = FootBar()
    @State private var creating = false
    @State private var opened: Int?
    @State private var deleting: TournamentSummary?

    var body: some View {
        content
            .background(Theme.paper)
            .navigationTitle("Tournaments")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("New") { creating = true } }
            }
            .footBar(foot)
            .navigationDestination(item: $opened) { TournamentScreen(id: $0) }
            .sheet(isPresented: $creating) {
                NewTournamentView { id in
                    opened = id
                    Task { await load() }
                }
            }
            .confirmSheet("Delete \(deleting?.name ?? "this tournament")?", message: "Its flights and results go with it. Your bottles and tastings stay.",
                          confirm: "Delete tournament", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                if let target = deleting { delete(target) }
            }
            .task { await load() }
            .refreshable { await load() }
    }

    @ViewBuilder private var content: some View {
        if !hasLoaded {
            if let error {
                ContentUnavailableView {
                    Label("Couldn't load", systemImage: "wifi.slash")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else if summaries.isEmpty {
            ContentUnavailableView {
                Label("No tournaments yet", systemImage: "trophy")
            } description: {
                Text("Pit bottles against each other, flight by flight, and see which one wins.")
            } actions: {
                Button("New tournament") { creating = true }.buttonStyle(.borderedProminent).tint(Theme.ink)
            }
        } else {
            List {
                ForEach(summaries) { summary in
                    NavigationLink { TournamentScreen(id: summary.id) } label: { TournamentRow(summary: summary) }
                        .swipeActions {
                            if TournamentSummaryText.canDelete(summary) {
                                Button("Delete", role: .destructive) { deleting = summary }.tint(Theme.error)
                            }
                        }
                }
            }
            .scrollContentBackground(.hidden)
            .font(.inter(16))
        }
    }

    private func load() async {
        guard let api = session.api else { return }
        do {
            summaries = try await api.tournaments()
            hasLoaded = true
            error = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            if hasLoaded { foot.fail(error, retry: { Task { await load() } }) } else { self.error = error.localizedDescription }
        }
    }

    private func delete(_ summary: TournamentSummary) {
        guard let api = session.api else { return }
        Task {
            do {
                try await api.deleteTournament(id: summary.id)
                summaries.removeAll { $0.id == summary.id }
                foot.show("Deleted \(summary.name).")
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                foot.fail(error, retry: { delete(summary) })
            }
        }
    }
}

/// One tournament in the list: name, a meta line, and for a running one how far the round is.
struct TournamentRow: View {
    let summary: TournamentSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(summary.name).font(.inter(17, .semibold)).foregroundStyle(Theme.ink)
            Text(TournamentSummaryText.metaLine(summary)).font(.inter(14)).foregroundStyle(Theme.muted)
            if TournamentSummaryText.showsProgress(summary) {
                ProgressBar(done: summary.progress.done, total: summary.progress.total).padding(.top, 2)
                Text(TournamentSummaryText.decidedLine(summary)).font(.inter(13)).monospacedDigit().foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(TournamentSummaryText.accessibilityLabel(summary))
    }
}

/// A thin bar, ink on a pale track. Drawn, not `ProgressView`, so it keeps the app's colours at every text size.
struct ProgressBar: View {
    let done: Int
    let total: Int

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.ink.opacity(0.12))
                Capsule().fill(Theme.ink).frame(width: total > 0 ? geo.size.width * CGFloat(min(done, total)) / CGFloat(total) : 0)
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}
