import SwiftUI

/// Start a label from the phone: a brand, a name, a category and, when there is one, the scanned barcode.
/// The rest of the label is filled in on the web.
struct NewLabelView: View {
    @Environment(Session.self) private var session

    let code: String?
    /// The label that was made, or the one the brand already had.
    var onDone: (LabelOption) -> Void

    @State private var brand = ""
    @State private var name: String
    @State private var barcode: String
    @State private var categoryId: Int?
    @State private var categories: [CategoryOption] = []
    @State private var loadFailure: String?
    @State private var saving = false
    @State private var error: String?
    /// Set when the brand already has a label of this name; offered instead of making another.
    @State private var existing: LabelOption?

    init(code: String?, name: String, onDone: @escaping (LabelOption) -> Void) {
        self.code = code
        self.onDone = onDone
        _name = State(initialValue: name)
        _barcode = State(initialValue: code ?? "")
    }

    private var groups: [(name: String, items: [CategoryOption])] {
        var order: [String] = []
        var byGroup: [String: [CategoryOption]] = [:]
        for category in categories {
            let group = category.parent ?? "Other"
            if byGroup[group] == nil { order.append(group) }
            byGroup[group, default: []].append(category)
        }
        return order.map { ($0, byGroup[$0] ?? []) }
    }

    private var canSave: Bool {
        !brand.trimmingCharacters(in: .whitespaces).isEmpty
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
            && categoryId != nil && !saving
    }

    var body: some View {
        Form {
            Section {
                TextField("Brand", text: $brand).textInputAutocapitalization(.words)
                TextField("Name", text: $name).textInputAutocapitalization(.words)
                Picker("Category", selection: $categoryId) {
                    Text("Choose…").tag(Int?.none)
                    ForEach(groups, id: \.name) { group in
                        Section(group.name) {
                            ForEach(group.items) { Text($0.name).tag(Int?.some($0.id)) }
                        }
                    }
                }
            } footer: {
                if let loadFailure { ErrorText(loadFailure) }
            }
            Section {
                TextField("Barcode", text: $barcode).keyboardType(.numberPad)
            } footer: {
                Text("Optional. The digits under the barcode, so a scan finds this label next time.")
            }
            if let existing {
                Section {
                    Button("Use \(existing.title)") { onDone(existing) }
                } footer: {
                    Text("You already have this label.")
                }
            }
            if let error { Section { ErrorText(error) } }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("New label")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(saving ? "Saving…" : "Save", action: save).disabled(!canSave)
            }
        }
        .task { await loadCategories() }
    }

    private func loadCategories() async {
        guard categories.isEmpty, let api = session.api else { return }
        do {
            categories = try await api.categories()
            loadFailure = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            loadFailure = "Couldn't load categories: \(error.localizedDescription)"
        }
    }

    private func save() {
        guard let categoryId, let api = session.api else { return }
        saving = true
        error = nil
        existing = nil
        Task {
            defer { saving = false }
            let typed = barcode.trimmingCharacters(in: .whitespaces)
            let upc = typed.isEmpty ? nil : Barcode.normalise(typed)
            if !typed.isEmpty && upc == nil {
                error = "A barcode is 6 to 32 digits."
                return
            }
            do {
                let label = try await api.createLabel(NewLabel(
                    brand: brand.trimmingCharacters(in: .whitespaces),
                    name: name.trimmingCharacters(in: .whitespaces),
                    categoryId: categoryId,
                    upc: upc
                ))
                onDone(label)
            } catch APIError.duplicateLabel(let label) {
                // Already there: offer it, and teach it the code if it has none (the server never overwrites).
                existing = label
                if let upc { try? await api.attachBarcode(labelId: label.id, code: upc) }
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
