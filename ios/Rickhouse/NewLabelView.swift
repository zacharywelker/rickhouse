import PhotosUI
import SwiftUI

/// Start a label from the phone: a brand from your list, a name, a category, the scanned barcode and a photo.
/// The rest of the label is filled in on the web (docs/superpowers/specs/2026-10-11-add-label-parity-design.md).
struct NewLabelView: View {
    @Environment(Session.self) private var session

    let code: String?
    /// The label that was made, or the one the brand already had.
    var onDone: (LabelOption) -> Void

    @State private var brand: LookupItem?
    @State private var name: String
    @State private var barcode: String
    @State private var categoryId: Int?
    @State private var categories: [CategoryOption] = []
    @State private var loadFailure: String?
    @State private var saving = false
    @State private var error: String?
    /// Set when the brand already has a label of this name; offered instead of making another.
    @State private var existing: LabelOption?

    @State private var photo: FormPhoto?
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    /// The label is saved but its photo isn't: Save becomes Retry photo, and the label can be used without it.
    @State private var made: LabelOption?

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
        if made != nil { return !saving }
        return brand != nil
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
            && categoryId != nil && !saving
    }

    var body: some View {
        Form {
            Section {
                BrandSearchField(selected: $brand)
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
            .disabled(made != nil)
            Section {
                TextField("Barcode", text: $barcode).keyboardType(.numberPad)
            } footer: {
                Text("Optional. The digits under the barcode, so a scan finds this label next time.")
            }
            .disabled(made != nil)
            Section {
                if photo != nil {
                    PhotoThumb(photo: Binding($photo)!) { photo = nil }
                } else {
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Take photo", systemImage: "camera") { showCamera = true }
                    }
                    PhotosPicker("Choose from library", selection: $pickerItem, matching: .images)
                }
            } header: {
                Text("Photo")
            } footer: {
                Text("Optional. The background is taken out when it can be.")
            }
            if let existing {
                Section {
                    Button("Use \(existing.title)") { onDone(existing) }
                } footer: {
                    Text(photo == nil
                         ? "You already have this label."
                         : "You already have this label. Your photo isn't added to it; change its photo on the web.")
                }
            }
            if let made {
                Section {
                    Button("Continue without the photo") { onDone(made) }
                } footer: {
                    Text("The label is saved.")
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
                Button(saving ? "Saving…" : made != nil ? "Retry photo" : "Save", action: save).disabled(!canSave)
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { add($0) }.ignoresSafeArea()
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    add(image)
                }
                pickerItem = nil
            }
        }
        .task { await loadCategories() }
    }

    /// Shows the photo at once, then swaps in the cutout if Vision can make one.
    private func add(_ image: UIImage) {
        let added = FormPhoto(original: image)
        photo = added
        Task {
            let cut = await Task.detached { image.cutout() }.value
            guard photo?.id == added.id else { return }
            photo?.cutout = cut
            photo?.working = false
        }
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
        guard let api = session.api else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            if let made {
                await uploadPhoto(to: made, api: api)
                return
            }
            guard let brand, let categoryId else { return }
            existing = nil
            let typed = barcode.trimmingCharacters(in: .whitespaces)
            let upc = typed.isEmpty ? nil : Barcode.normalise(typed)
            if !typed.isEmpty && upc == nil {
                error = "A barcode is 6 to 32 digits."
                return
            }
            do {
                let label = try await api.createLabel(NewLabel(
                    brand: brand.name,
                    name: name.trimmingCharacters(in: .whitespaces),
                    categoryId: categoryId,
                    upc: upc
                ))
                if photo == nil { onDone(label) } else { await uploadPhoto(to: label, api: api) }
            } catch APIError.duplicateLabel(let label) {
                // Already there: offer it, and teach it the code if it has none (the server never overwrites).
                // The photo is not put on it: that would replace whatever photo it has.
                existing = label
                if let upc { try? await api.attachBarcode(labelId: label.id, code: upc) }
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    /// The label exists; its photo follows. A failure keeps the screen, the photo and the label.
    private func uploadPhoto(to label: LabelOption, api: APIClient) async {
        guard let image = photo?.encoded() else { onDone(label); return }
        do {
            try await api.uploadLabelPhoto(expressionId: label.id, image: image)
            onDone(label)
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            made = label
            self.error = "The label is saved, but its photo didn't upload: \(error.localizedDescription)"
        }
    }
}

/// Brand, typed and chosen in place: matches from your brands list below as you type,
/// ending with a row that adds the typed name as a new brand. Picking one fills the field;
/// tapping it again goes back to searching.
struct BrandSearchField: View {
    @Environment(Session.self) private var session
    @Binding var selected: LookupItem?

    @State private var query = ""
    @State private var items: [LookupItem] = []
    @State private var loaded = false
    @State private var creating = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private var typed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        if let selected {
            Button {
                query = selected.name
                self.selected = nil
                focused = true
            } label: {
                HStack {
                    Text("Brand").foregroundStyle(Theme.muted)
                    Spacer()
                    Text(selected.name).foregroundStyle(Theme.ink)
                    Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(Theme.ink).accessibilityHidden(true)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Brand, \(selected.name)")
            .accessibilityHint("Choose a different brand")
        } else {
            TextField("Brand", text: $query)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .focused($focused)
                .task { await load() }
            if let error { ErrorText(error) }
            if !typed.isEmpty {
                let matches = Array(PickerLogic.matching(typed, in: items).prefix(5))
                let near = PickerLogic.exact(typed, in: items) == nil
                    ? PickerLogic.nearMatches(typed, in: items).filter { n in !matches.contains { $0.id == n.id } }
                    : []
                ForEach(matches + near) { item in
                    Button { selected = item } label: {
                        Text(item.name).foregroundStyle(Theme.ink).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, 12)
                }
                if PickerLogic.offersNew(typed, kind: .brands, in: items) {
                    Button(action: create) {
                        HStack {
                            Text("Add “\(typed)” as a new brand").font(.inter(16, .semibold))
                            Spacer()
                            if creating { ProgressView() } else { Image(systemName: "plus") }
                        }
                        .frame(minHeight: 44)
                    }
                    .disabled(creating)
                }
            }
        }
    }

    private func load() async {
        guard !loaded, let api = session.api else { return }
        do {
            items = try await api.lookups(.brands)
            loaded = true
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            self.error = "Couldn't load your brands: \(error.localizedDescription)"
        }
    }

    private func create() {
        guard let api = session.api, !creating else { return }
        creating = true
        error = nil
        let name = typed
        Task {
            defer { creating = false }
            do {
                // Hands back the brand already under this name, in any case, rather than making a twin.
                let made = try await api.createLookup(.brands, name: name)
                let item = LookupItem(id: made.id, name: made.name)
                if !items.contains(where: { $0.id == item.id }) { items.append(item) }
                selected = item
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
