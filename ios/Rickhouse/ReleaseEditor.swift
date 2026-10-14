import SwiftUI

/// Adds a known release to a label, or changes one: the batch or yearly edition a bottle can say it is, with the proof,
/// age and MSRP it takes unless the bottle says otherwise. It saves on its own, apart from the label's Save. Releases
/// are never removed here, since each carries a photo, notes and bottles: that stays on the web.
struct ReleaseEditor: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    let labelId: Int
    /// Nil adds a new one.
    let release: LabelRelease?
    var onSaved: () -> Void

    @State private var name: Field
    @State private var year: Field
    @State private var proof: Field
    @State private var ageYears: Field
    @State private var ageMonths: Field
    @State private var ageDays: Field
    @State private var msrp: Field
    @State private var saving = false
    @State private var error: String?

    init(labelId: Int, release: LabelRelease?, onSaved: @escaping () -> Void) {
        self.labelId = labelId
        self.release = release
        self.onSaved = onSaved
        _name = State(initialValue: Field(release?.name))
        _year = State(initialValue: Field(release?.releaseYear.map(String.init)))
        _proof = State(initialValue: Field(plainNumber(release?.proof)))
        _ageYears = State(initialValue: Field(plainNumber(release?.ageYears)))
        _ageMonths = State(initialValue: Field(release?.ageMonths.map(String.init)))
        _ageDays = State(initialValue: Field(release?.ageDays.map(String.init)))
        _msrp = State(initialValue: Field(plainNumber(release?.msrp)))
    }

    private var isNew: Bool { release == nil }

    /// Each column with what it holds now, in the names the server takes.
    private var columns: [(key: String, field: Field)] {
        [("name", name), ("year", year), ("proof", proof), ("ageYears", ageYears), ("ageMonths", ageMonths), ("ageDays", ageDays), ("msrp", msrp)]
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    EditRow(title: "Name", field: $name, placeholder: "2024-01 Springfield", tracksChanges: !isNew)
                    EditRow(title: "Year", field: $year, placeholder: "2024", keyboard: .numberPad, tracksChanges: !isNew)
                    StrengthRow(proof: $proof, tracksChanges: !isNew)
                    AgeRow(years: $ageYears, months: $ageMonths, days: $ageDays, error: nil)
                    EditRow(title: "MSRP", field: $msrp, placeholder: "Add MSRP", keyboard: .decimalPad, prefix: session.currencySymbol, tracksChanges: false)
                } footer: {
                    Text("A bottle of this release takes its proof, age and MSRP unless the bottle says otherwise. Leave a box blank to use the label's.")
                }
                if let error { Section { ErrorText(error) } }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle(isNew ? "Add release" : "Release")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(saving || name.isEmpty)
                }
            }
        }
        .interactiveDismissDisabled(columns.contains { $0.field.changed })
    }

    private func save() {
        guard let api = session.api, !saving else { return }
        // A new release sends what is filled in; a changed one sends only what changed, a cleared box as blank.
        let sent = columns.filter { isNew ? !$0.field.isEmpty : $0.field.changed }
        if sent.isEmpty { dismiss(); return }
        let body = Dictionary(uniqueKeysWithValues: sent.map { ($0.key, $0.field.trimmed) })
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                if let release { try await api.updateRelease(labelId: labelId, releaseId: release.id, body) }
                else { try await api.addRelease(labelId: labelId, body) }
                onSaved()
                dismiss()
            } catch APIError.unauthorized {
                session.signOut()
            } catch APIError.invalid(_, let message, _) {
                error = message
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
