import SwiftUI

/// Choosing the field from your own bottles: search, filters, a multi-select list, plus a label you do not own and
/// outside entries. The selection is `TournamentFieldSelection`'s; this view only draws it and runs the search.
struct FieldPickerSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    @Binding var field: FieldState

    @State private var filters = FieldFilters.initial
    @State private var page: FieldPage?
    @State private var searching = false
    @State private var failed: String?
    @State private var ticket = RequestTicket()
    @State private var previousQuery = ""
    @State private var attempt = 0
    @State private var categories: [CategoryOption] = []
    @State private var choosingCategory = false
    @State private var addingLabel = false

    private struct SearchRequest: Equatable {
        let filters: FieldFilters
        let attempt: Int
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    SearchField(prompt: "Search your bottles", text: $filters.q).padding(.top, 4)
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    filterRows.listRowBackground(Color.clear)
                }
                Section { results } header: { summary }
                Section {
                    Button { addingLabel = true } label: { Label("Add a label you don't own", systemImage: "tag").frame(minHeight: 44) }
                    OutsideEntryRow { add(outside: $0) }
                } footer: {
                    if let notice = field.notice { Text(notice).foregroundStyle(Theme.error) }
                }
            }
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .font(.inter(16))
            .background(Theme.paper)
            .navigationTitle(FieldPickerText.summaryTitle(field.entries.count))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task(id: SearchRequest(filters: filters, attempt: attempt)) {
                let asked = filters
                let debounce = previousQuery != asked.q
                previousQuery = asked.q
                if debounce {
                    do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                }
                await search(asked)
            }
            .task { categories = (try? await session.api?.categories()) ?? [] }
            .optionSheet("Category", isPresented: $choosingCategory, options: categoryOptions, selection: categorySelection) { id in
                filters.categoryIds = id.isEmpty ? [] : [Int(id) ?? 0]
            }
            .sheet(isPresented: $addingLabel) {
                LabelSearchSheet { label in
                    field = TournamentFieldSelection.reduce(field, .addLabel(expressionId: label.expressionId, name: label.name))
                }
            }
        }
    }

    // MARK: Filters

    @ViewBuilder private var filterRows: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Status")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 300 : 92), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(FieldFilters.allStatuses, id: \.self) { status in
                    let on = filters.statuses?.contains(status) ?? false
                    Button { filters = filters.togglingStatus(status) } label: {
                        Text(status.capitalized).font(.inter(14, .medium)).frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(on ? Theme.paper : Theme.ink)
                            .background(on ? Theme.ink : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            if filters.statuses?.isEmpty == true { Text("No status chosen: every status is shown.").font(.inter(13)).foregroundStyle(Theme.muted) }
        }
        .padding(.vertical, 4)
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel("Opened")
            Picker("Opened", selection: $filters.opened) {
                Text("Any").tag(FieldFilters.Opened.any); Text("Open").tag(FieldFilters.Opened.open); Text("Sealed").tag(FieldFilters.Opened.sealed)
            }.pickerStyle(.segmented)
        }
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel("Tasted")
            Picker("Tasted", selection: $filters.tasted) {
                Text("Any").tag(FieldFilters.Tasted.any); Text("Tasted").tag(FieldFilters.Tasted.tasted); Text("Untasted").tag(FieldFilters.Tasted.untasted)
            }.pickerStyle(.segmented)
        }
        PickerRow(title: "Category", value: categoryName) { choosingCategory = true }
    }

    private var categoryOptions: [PickerOption] { [PickerOption(id: "", title: "Any category")] + categories.map { PickerOption(id: String($0.id), title: $0.name) } }
    private var categorySelection: String { filters.categoryIds.first.map(String.init) ?? "" }
    private var categoryName: String { categories.first { $0.id == filters.categoryIds.first }?.name ?? "Any" }

    // MARK: Results

    private var summary: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let page {
                HStack {
                    Text(FieldPickerText.chosenLine(chosen: TournamentFieldSelection.chosenAmong(field.entries, shown: page.rows.map(\.bottleId)), shown: page.rows.count))
                        .monospacedDigit().accessibilityAddTraits(.updatesFrequently)
                    if searching { ProgressView().accessibilityLabel("Searching") }
                }
                if let cut = FieldPickerText.cutoffLine(shown: page.rows.count, total: page.total) { Text(cut).monospacedDigit() }
                AnyLayout(typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading)) : AnyLayout(HStackLayout())) {
                    Button("Select all shown") { field = TournamentFieldSelection.reduce(field, .selectAll(page.rows.map(picked))) }
                        .disabled(page.rows.isEmpty).frame(minHeight: 44)
                    Button("Clear") { field = TournamentFieldSelection.reduce(field, .clear) }
                        .disabled(field.entries.isEmpty).frame(minHeight: 44)
                }.buttonStyle(.borderless).font(.inter(15, .semibold))
            }
        }
        .textCase(nil).font(.inter(14)).foregroundStyle(Theme.ink)
    }

    @ViewBuilder private var results: some View {
        if let page {
            if page.rows.isEmpty {
                Text("No bottle matches these filters. Loosen a filter, or add a label or an outside entry below.").foregroundStyle(Theme.muted)
            }
            ForEach(page.rows) { row in
                let chosen = field.entries.contains { $0.key == PickedEntry.bottle(picked(row)).key }
                Button { field = TournamentFieldSelection.reduce(field, .toggleBottle(picked(row))) } label: { candidateRow(row, chosen: chosen) }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(chosen ? .isSelected : [])
            }
        } else if let failed {
            VStack(alignment: .leading, spacing: 8) {
                ErrorText(failed)
                Button("Try again") { attempt += 1 }.frame(minHeight: 44)
            }
        } else {
            HStack(spacing: 8) { ProgressView(); Text("Loading your bottles…").foregroundStyle(Theme.muted) }.frame(minHeight: 44)
        }
    }

    private func candidateRow(_ row: FieldCandidate, chosen: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: chosen ? "checkmark.circle.fill" : "circle").font(.system(size: 24)).foregroundStyle(Theme.ink).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                Text(detail(row)).font(.inter(13)).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func detail(_ row: FieldCandidate) -> String {
        let state = row.isOpen ? "Open" : row.status == "owned" ? "Sealed" : row.status.capitalized
        return [row.category, Format.proof(row.proof.map { String($0) }), state, row.tastings == 0 ? "untasted" : "\(row.tastings) \(row.tastings == 1 ? "tasting" : "tastings")"]
            .compactMap { $0 }.joined(separator: " · ")
    }

    private func picked(_ row: FieldCandidate) -> PickedBottle { PickedBottle(bottleId: row.bottleId, expressionId: row.expressionId, name: row.name) }

    private func add(outside name: String) -> Bool {
        let next = TournamentFieldSelection.reduce(field, .addAdhoc(name))
        let added = next.entries.count > field.entries.count
        field = next
        return added
    }

    // MARK: Search

    private func search(_ asked: FieldFilters) async {
        guard !Task.isCancelled, let api = session.api else { return }
        let mine = ticket.issue()
        searching = true
        defer { if ticket.isCurrent(mine) { searching = false } }
        do {
            let answer = try await api.fieldCandidates(asked)
            guard !Task.isCancelled, ticket.isCurrent(mine), asked == filters else { return }
            page = answer
            failed = nil
        } catch APIError.unauthorized {
            guard !Task.isCancelled, ticket.isCurrent(mine), asked == filters else { return }
            session.signOut()
        } catch {
            // A keystroke cancels the request before it; that is not a failure to show.
            if Task.isCancelled || APIError.isCancellation(error) { return }
            guard ticket.isCurrent(mine), asked == filters else { return }
            failed = error.localizedDescription
        }
    }
}
