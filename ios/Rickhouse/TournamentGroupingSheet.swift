import SwiftUI

/// A running tournament's Grouping sheet: seeding and the grouping priority, the only settings the server lets change
/// once it has started. It patches only those two (`SettingsDraft.groupingPatch`).
struct GroupingSheet: View {
    @Environment(\.dismiss) private var dismiss
    let view: TournamentView
    let onSave: (TournamentPatch) async -> ActionResult

    @State private var draft: SettingsDraft
    @State private var saving = false
    @State private var message: String?
    @State private var errors = FormFieldErrors()

    init(view: TournamentView, onSave: @escaping (TournamentPatch) async -> ActionResult) {
        self.view = view
        self.onSave = onSave
        _draft = State(initialValue: SettingsDraft(view))
    }

    private var patch: TournamentPatch? { draft.groupingPatch(against: view) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Seeding")
                        Picker("Seeding", selection: $draft.seeding) { Text("Similar").tag(Seeding.similar); Text("Random").tag(Seeding.random) }.pickerStyle(.segmented)
                        Text(draft.seeding == .similar ? "Similar puts alike bottles in a flight, by the priority below." : "Random shuffles every round.")
                            .font(.inter(13)).foregroundStyle(Theme.muted)
                        errors.message(for: "seeding").map { ErrorText($0) }
                    }
                } header: { SectionLabel("Seeding") }
                Section {
                    PriorityListView(order: $draft.groupOrder)
                    errors.message(for: "groupOrder").map { ErrorText($0) }
                } header: { SectionLabel("Grouping priority") } footer: {
                    Text(TournamentScreenLogic.groupingNote)
                }
                if let message { Section { ErrorText(message) } }
            }
            .scrollContentBackground(.hidden)
            .font(.inter(16))
            .background(Theme.paper)
            .navigationTitle("Grouping")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(patch == nil || saving) }
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private func save() {
        guard let patch, !saving else { return }
        saving = true
        message = nil
        errors = FormFieldErrors()
        Task {
            let result = await onSave(patch)
            saving = false
            switch result {
            case .done: dismiss()
            case .failed(let text, let fields): message = text; errors = FormFieldErrors(fields: fields)
            case .busy: message = "Another change is still saving. Try again in a moment."
            }
        }
    }
}
