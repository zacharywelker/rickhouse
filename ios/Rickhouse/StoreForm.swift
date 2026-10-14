import SwiftUI

/// A new store: its name and where it is (issue #203). Name alone is not enough, because "Total Wine" in Austin and in
/// Dallas are two stores; the server hands back the one already at this name and place rather than making a copy.
/// The web's website and notes stay on the web.
struct StoreForm: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State var name: String
    @State private var city = ""
    @State private var state = ""
    @State private var country = ""
    @State private var online = false
    @State private var saving = false
    @State private var error: String?
    /// The store, once the server has it.
    var onMade: (LookupItem) -> Void

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name).textInputAutocapitalization(.words)
                    Toggle("Online store", isOn: $online)
                }
                if !online {
                    Section {
                        TextField("City", text: $city).textInputAutocapitalization(.words)
                        TextField("State (KY or Kentucky)", text: $state).textInputAutocapitalization(.words)
                        TextField("Country (USA)", text: $country).textInputAutocapitalization(.words)
                    } header: { SectionLabel("Where") }
                }
                if let error { Section { ErrorText(error) } }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle("New store")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Add", action: save).fontWeight(.semibold)
                        .disabled(saving || trimmedName.isEmpty)
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
                let made = try await api.createStore(
                    name: trimmedName,
                    city: online ? "" : city, state: online ? "" : state, country: online ? "" : country,
                    isOnline: online
                )
                let place = online ? "Online" : [city, state].map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: ", ")
                onMade(LookupItem(id: made.id, name: made.name, detail: place.isEmpty ? nil : place))
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
