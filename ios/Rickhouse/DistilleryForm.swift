import SwiftUI

/// A new distillery with its details (issue #223), opened from the picker's "Add as a new distillery". It is the
/// web's "add with details", without the company, slug and older names. The server hands back the distillery you
/// already have under this name rather than making a copy, and keeps what it holds, so the page says so instead of
/// letting the details you just typed look saved.
struct DistilleryForm: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var draft: DistilleryDraft
    @State private var saving = false
    @State private var error: String?
    /// Set when the name was already one of yours: the details were not saved.
    @State private var existing: LookupItem?
    /// The distillery, once the server has it (or you chose the one you already had).
    var onMade: (LookupItem) -> Void

    init(name: String, onMade: @escaping (LookupItem) -> Void) {
        _draft = State(initialValue: DistilleryDraft(name: name))
        self.onMade = onMade
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $draft.name).textInputAutocapitalization(.words)
                    Toggle("Undisclosed — only a place is given", isOn: $draft.undisclosed)
                } footer: {
                    Text("For a bottle that says only “Distilled in Indiana”, name it “Undisclosed (Indiana)” and set the state.")
                }
                Section {
                    TextField("City", text: $draft.city).textInputAutocapitalization(.words)
                    TextField("State (KY or Kentucky)", text: $draft.state).textInputAutocapitalization(.words)
                    TextField("Country", text: $draft.country).textInputAutocapitalization(.words)
                } header: { SectionLabel("Where") }
                Section {
                    Picker("Scotch region", selection: $draft.region) {
                        Text("None").tag("")
                        ForEach(DistilleryDraft.scotchRegions, id: \.self) { Text($0).tag($0) }
                    }
                    if draft.showsDSP { TextField("DSP number (DSP-KY-95)", text: $draft.dspNumber).textInputAutocapitalization(.characters) }
                    if draft.showsNOM { TextField("NOM", text: $draft.nomNumber).keyboardType(.numbersAndPunctuation) }
                    TextField("Founded", text: $draft.founded)
                        .keyboardType(.numberPad)
                        .onChange(of: draft.founded) { _, text in
                            let digits = String(text.filter(\.isNumber).prefix(4))
                            if digits != text { draft.founded = digits }
                        }
                    Toggle("Defunct", isOn: $draft.isDefunct)
                } header: { SectionLabel("Details") } footer: {
                    Text("Which Scotch region it is in, if any. Linking it to a Scotch label adds that region to the label.")
                }
                Section {
                    TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(3...6)
                }
                if let existing {
                    Section {
                        Text("You already have a distillery called “\(existing.name)”. Its details were not changed.")
                            .font(.inter(14, relativeTo: .callout))
                        Button("Use “\(existing.name)”") { onMade(existing) }.fontWeight(.semibold)
                    }
                }
                if let error { Section { ErrorText(error) } }
            }
            .scrollContentBackground(.hidden)
            .keyboardDone()
            .background(Theme.paper)
            .navigationTitle("New distillery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Add", action: save).fontWeight(.semibold)
                        .disabled(saving || !draft.canSave || existing != nil)
                }
            }
        }
    }

    private func save() {
        guard let api = session.api, !saving else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                let made = try await api.createDistillery(draft)
                // The one you already had keeps its own place, which isn't what was just typed.
                if made.created { onMade(LookupItem(id: made.id, name: made.name, detail: draft.detail, region: draft.region.isEmpty ? nil : draft.region)) } else { existing = LookupItem(id: made.id, name: made.name) }
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
