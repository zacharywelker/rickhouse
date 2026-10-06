import PhotosUI
import SwiftUI

/// The bottle itself, quick first: the photo and Save. Price, date and the rest sit under More details.
struct BottleFormView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    let label: LabelOption
    /// Closes the whole Add a bottle sheet after a save.
    var onSaved: () -> Void

    @State private var photos: [UIImage] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showDetails = false
    @State private var price = ""
    @State private var acquired = Date()
    @State private var includeDate = true
    @State private var batch = ""
    @State private var location = ""
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?
    /// Set once the bottle exists, so a retry after a failed photo upload
    /// only re-sends the photos instead of adding the bottle twice.
    @State private var createdId: Int?

    var body: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    Rectangle().fill(CategoryPalette.color(for: label.category))
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label.title).font(.inter(17, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                        Text(label.category).font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    if createdId == nil { Button("Change") { dismiss() } }
                }
            }
            Section("Photos") {
                if !photos.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(photos.indices, id: \.self) { i in
                                Image(uiImage: photos[i]).resizable().scaledToFill()
                                    .frame(width: 80, height: 100).clipShape(RoundedRectangle(cornerRadius: 6))
                                    .overlay(alignment: .topTrailing) {
                                        Button { photos.remove(at: i) } label: {
                                            Image(systemName: "xmark.circle.fill").symbolRenderingMode(.palette)
                                                .foregroundStyle(Theme.paper, Theme.ink)
                                        }
                                        .accessibilityLabel("Remove photo \\(i + 1)")
                                        .padding(2)
                                    }
                            }
                        }
                    }
                }
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("Take photo", systemImage: "camera") { showCamera = true }
                }
                PhotosPicker("Choose from library", selection: $pickerItems, maxSelectionCount: 6, matching: .images)
            }
            Section {
                DisclosureGroup("More details", isExpanded: $showDetails) {
                    TextField("Price paid", text: $price).keyboardType(.decimalPad)
                    Toggle("Date acquired", isOn: $includeDate)
                    if includeDate { DatePicker("Date", selection: $acquired, in: ...Date(), displayedComponents: .date) }
                    TextField("Batch", text: $batch)
                    TextField("Where it's kept", text: $location)
                    TextField("Notes", text: $notes, axis: .vertical)
                }
            }
            if let error { Section { ErrorText(error) } }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("Add bottle")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(saving ? "Saving…" : error == nil ? "Save" : "Retry", action: save).disabled(saving)
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { photos.append($0) }.ignoresSafeArea()
        }
        .onChange(of: pickerItems) { _, items in
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        photos.append(image)
                    }
                }
                pickerItems = []
            }
        }
    }

    private func save() {
        guard let api = session.api else { return }
        saving = true
        error = nil
        Task {
            do {
                let id: Int
                if let createdId {
                    id = createdId
                } else {
                    var bottle = NewBottle(expressionId: label.id)
                    bottle.pricePaid = price.isEmpty ? nil : price
                    bottle.dateAcquired = includeDate ? Self.isoDay.string(from: acquired) : nil
                    bottle.batch = batch.isEmpty ? nil : batch
                    bottle.location = location.isEmpty ? nil : location
                    bottle.notes = notes.isEmpty ? nil : notes
                    id = try await api.createBottle(bottle)
                    createdId = id
                }
                if !photos.isEmpty {
                    // Downscaled so a 12 MP photo doesn't cross the home network at full size.
                    let jpegs = photos.compactMap { $0.scaled(maxEdge: 2000).jpegData(compressionQuality: 0.85) }
                    try await api.uploadImages(bottleId: id, jpegs: jpegs)
                }
                onSaved()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                // The form and photos stay, so nothing is lost to a bad connection.
                self.error = createdId == nil
                    ? error.localizedDescription
                    : "The bottle was saved, but its photos weren't: \\(error.localizedDescription)"
                saving = false
            }
        }
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
