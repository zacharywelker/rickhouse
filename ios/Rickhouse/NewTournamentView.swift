import SwiftUI

/// The new-tournament sheet: name and settings, the priority order, and the field. Create makes a draft (any number of
/// entries; starting needs 2) and hands its id back (the list opens it once the sheet has closed).
struct NewTournamentView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    var onCreated: (Int) -> Void

    @State private var draft: NewTournamentDraft
    @State private var picking = false
    @State private var submitting = false
    @State private var message: String?
    @State private var errors = FormFieldErrors()
    @State private var foot = FootBar()

    init(initial: NewTournamentDraft = NewTournamentDraft(), onCreated: @escaping (Int) -> Void) {
        _draft = State(initialValue: initial)
        self.onCreated = onCreated
    }

    var body: some View {
        NavigationStack {
            Form {
                nameSection
                settingsSection
                prioritySection
                fieldSection
                createSection
            }
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .font(.inter(16))
            .background(Theme.paper)
            .navigationTitle("New tournament")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(submitting) }
                ToolbarItem(placement: .confirmationAction) { Button("Create") { create() }.disabled(!draft.canCreate || submitting) }
            }
            .footBar(foot)
            .sheet(isPresented: $picking) { FieldPickerSheet(field: $draft.field) }
        }
        .interactiveDismissDisabled(submitting)
    }

    private func caption(_ text: String) -> some View { Text(text).font(.inter(13)).foregroundStyle(Theme.muted) }
    private func problem(_ field: String) -> some View { errors.message(for: field).map { ErrorText($0) } }

    private var nameSection: some View {
        Section {
            TextField("Bourbon, spring", text: $draft.name, axis: .vertical)
                .lineLimit(1...3)
                .frame(minHeight: 44)
                .onChange(of: draft.name) { _, new in if TournamentLimits.length(new) > NewTournamentDraft.maxName { draft.name = TournamentLimits.clamp(new, to: NewTournamentDraft.maxName) } }
                .accessibilityLabel("Name")
            problem("name")
        } header: { SectionLabel("Name") }
    }

    private var settingsSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text("Bottles per flight")
                HeatSizePicker(size: $draft.heatSize)
                caption("A flight is one tasting. Four bottles is the most a palate holds well.")
                problem("heatSize")
            }
            VStack(alignment: .leading, spacing: 4) {
                Toggle("Blind", isOn: $draft.blind).tint(Theme.ink).frame(minHeight: 44)
                caption("You will not see names until a flight is decided.")
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Seeding")
                Picker("Seeding", selection: $draft.seeding) { Text("Similar").tag(Seeding.similar); Text("Random").tag(Seeding.random) }.pickerStyle(.segmented)
                caption(draft.seeding == .similar ? "Similar puts alike bottles in a flight, by the priority below." : "Random shuffles every round, which gives the ranking more cross-strength matches.")
                problem("seeding")
            }
        } header: { SectionLabel("Settings") }
    }

    private var prioritySection: some View {
        Section {
            PriorityListView(order: $draft.groupOrder)
            problem("groupOrder")
        } header: { SectionLabel("Grouping priority") } footer: {
            Text("Highest first. In a draft a new order applies at once; once running it applies to the next round, or to this one right away with Reset to automatic.")
        }
    }

    @ViewBuilder private var fieldSection: some View {
        Section {
            Button { picking = true } label: {
                HStack { Text(FieldPickerText.summaryTitle(draft.field.entries.count)).foregroundStyle(Theme.ink); Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.muted).accessibilityHidden(true) }
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            .accessibilityHint("Opens your bottles to choose from")
            ForEach(draft.field.entries, id: \.key) { entry in
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.name).foregroundStyle(Theme.ink)
                        Text(FieldPickerText.kind(entry)).font(.inter(13)).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    Button { draft.field = TournamentFieldSelection.reduce(draft.field, .remove(key: entry.key)) } label: {
                        Image(systemName: "minus.circle").font(.system(size: 22)).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.borderless).foregroundStyle(Theme.error).accessibilityLabel("Remove \(entry.name)")
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .contain)
                .swipeActions { Button("Remove", role: .destructive) { draft.field = TournamentFieldSelection.reduce(draft.field, .remove(key: entry.key)) } }
            }
            problem("entries")
        } header: { SectionLabel("Field") }
        Section {
            TextField("How you chose these bottles", text: $draft.fieldNote, axis: .vertical).lineLimit(1...3)
                .onChange(of: draft.fieldNote) { _, new in if TournamentLimits.length(new) > NewTournamentDraft.maxNote { draft.fieldNote = TournamentLimits.clamp(new, to: NewTournamentDraft.maxNote) } }
                .accessibilityLabel("Field note, optional")
            problem("fieldNote")
        } header: { SectionLabel("Field note (optional)") }
    }

    private var createSection: some View {
        Section {
            if let message { ErrorText(message) }
            caption(draft.disabledReason ?? draft.helperLine)
            Button(action: create) {
                HStack(spacing: 8) { if submitting { ProgressView().tint(Theme.paper) }; Text(submitting ? "Creating…" : "Create tournament") }
                    .font(.inter(17, .semibold, relativeTo: .headline)).frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Theme.paper).background(draft.canCreate && !submitting ? Theme.ink : Theme.muted, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain).disabled(!draft.canCreate || submitting)
        }
    }

    private func create() {
        guard draft.canCreate, !submitting, let api = session.api else { return }
        submitting = true
        message = nil
        errors = FormFieldErrors()
        Task {
            defer { submitting = false }
            do {
                let id = try await api.createTournament(draft.request)
                onCreated(id)
                dismiss()
            } catch APIError.unauthorized {
                session.signOut()
            } catch APIError.invalid(_, let text, let fields) {
                message = text
                errors = FormFieldErrors(fields: fields)
            } catch {
                foot.fail(error, retry: { create() })
            }
        }
    }
}
