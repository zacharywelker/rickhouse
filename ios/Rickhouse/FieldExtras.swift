import SwiftUI

/// "Add an outside entry": a name that is not in your collection (a bottle from a friend, one you tasted elsewhere).
struct OutsideEntryRow: View {
    let onAdd: (String) -> Bool
    @State private var text = ""

    var body: some View {
        HStack(spacing: 8) {
            TextField("Add an outside entry", text: $text)
                .font(.inter(16))
                .submitLabel(.done)
                .onSubmit(add)
            Button("Add", action: add)
                .font(.inter(16, .semibold))
                .frame(minWidth: 44, minHeight: 44)
                .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .frame(minHeight: 44)
    }

    private func add() {
        if onAdd(text) { text = "" }
    }
}

/// "Add a label you don't own": search your labels and add one with no bottle behind it.
struct LabelSearchSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let onPick: (LabelCandidate) -> Void

    @State private var query = ""
    @State private var rows: [LabelCandidate]?
    @State private var failed: String?
    @State private var ticket = RequestTicket()
    @State private var pending: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SearchField(prompt: "Search your labels", text: $query).padding(.top, 8)
                content
            }
            .background(Theme.paper)
            .navigationTitle("Add a label")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onChange(of: query) { _, _ in schedule(delay: 250) }
            .task { await search() }
        }
    }

    @ViewBuilder private var content: some View {
        if let rows {
            List(rows) { row in
                Button { onPick(row); dismiss() } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                        Text([row.category, Format.proof(row.proof.map { String($0) })].compactMap { $0 }.joined(separator: " · "))
                            .font(.inter(13)).foregroundStyle(Theme.muted)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
            }
            .scrollContentBackground(.hidden)
            .overlay { if rows.isEmpty { Text("No label matches.").font(.inter(15)).foregroundStyle(Theme.muted) } }
        } else if let failed {
            ContentUnavailableView {
                Label("Couldn't search", systemImage: "wifi.slash")
            } description: { Text(failed) } actions: { Button("Try again") { Task { await search() } } }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func schedule(delay: Int) {
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .milliseconds(delay))
            if !Task.isCancelled { await search() }
        }
    }

    private func search() async {
        guard let api = session.api else { return }
        let mine = ticket.issue()
        do {
            let found = try await api.labelCandidates(matching: query.trimmingCharacters(in: .whitespaces))
            guard ticket.isCurrent(mine) else { return }
            rows = found
            failed = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            guard ticket.isCurrent(mine) else { return }
            if rows == nil { failed = error.localizedDescription }
        }
    }
}
