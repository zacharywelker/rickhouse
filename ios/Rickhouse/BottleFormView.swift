import PhotosUI
import SwiftUI

/// The bottle itself, quick first: the photo and Save. Price, date and the rest sit under More details.
struct BottleFormView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    let label: LabelOption
    /// Closes the whole Add a bottle sheet after a save.
    var onSaved: () -> Void

    @State private var photos: [FormPhoto] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showDetails = false
    @State private var price = Field("")
    /// Today unless cleared: most bottles are logged the day they come home.
    @State private var acquired = Field(Format.isoDay(Date()))
    @State private var batch = Field("")
    @State private var location = Field("")
    @State private var notes = Field("")
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
            Section {
                if !photos.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach($photos) { $photo in
                                PhotoThumb(photo: $photo) { photos.removeAll { $0.id == photo.id } }
                            }
                        }
                    }
                }
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("Take photo", systemImage: "camera") { showCamera = true }
                }
                PhotosPicker("Choose from library", selection: $pickerItems, maxSelectionCount: 6, matching: .images)
            } header: { SectionLabel("Photos") }
            Section {
                DisclosureGroup("More details", isExpanded: $showDetails) {
                    EditRow(title: "Price paid", field: $price, placeholder: "0.00", keyboard: .decimalPad, prefix: session.currencySymbol, tracksChanges: false)
                    DateRow(title: "Date acquired", field: $acquired, tracksChanges: false)
                    EditRow(title: "Batch", field: $batch, placeholder: "Optional", tracksChanges: false)
                    EditRow(title: "Where it's kept", field: $location, placeholder: "Optional", tracksChanges: false)
                    EditRow(title: "Notes", field: $notes, placeholder: "Optional", multiline: true, tracksChanges: false)
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
            CameraPicker { add($0) }.ignoresSafeArea()
        }
        .onChange(of: pickerItems) { _, items in
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        add(image)
                    }
                }
                pickerItems = []
            }
        }
    }

    /// Shows the photo at once, then swaps in the cutout if Vision can make one.
    private func add(_ image: UIImage) {
        let photo = FormPhoto(original: image)
        photos.append(photo)
        Task {
            let cut = await Task.detached { image.cutout() }.value
            guard let i = photos.firstIndex(where: { $0.id == photo.id }) else { return }
            photos[i].cutout = cut
            photos[i].working = false
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
                    bottle.pricePaid = price.isEmpty ? nil : price.trimmed
                    bottle.dateAcquired = acquired.isEmpty ? nil : acquired.trimmed
                    bottle.batch = batch.isEmpty ? nil : batch.trimmed
                    bottle.location = location.isEmpty ? nil : location.trimmed
                    bottle.notes = notes.isEmpty ? nil : notes.trimmed
                    id = try await api.createBottle(bottle)
                    createdId = id
                }
                if !photos.isEmpty {
                    // Downscaled so a 12 MP photo doesn't cross the home network at full size.
                    // A cutout goes as PNG so the server keeps its transparency and crops to the bottle.
                    try await api.uploadImages(bottleId: id, images: photos.compactMap { $0.encoded() })
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
}

/// A photo thumbnail: remove at the top right, and once a cutout exists a scissors badge that flips cutout and original.
struct PhotoThumb: View {
    @Binding var photo: FormPhoto
    var onRemove: () -> Void

    var body: some View {
        Image(uiImage: photo.chosen).resizable().scaledToFill()
            .frame(width: 80, height: 100).clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay { if photo.working { ProgressView() } }
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill").symbolRenderingMode(.palette)
                        .foregroundStyle(Theme.paper, Theme.ink)
                }
                .accessibilityLabel("Remove photo")
                .padding(2)
            }
            .overlay(alignment: .bottomLeading) {
                if photo.cutout != nil {
                    Button { photo.useCutout.toggle() } label: {
                        Image(systemName: "scissors").font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(photo.useCutout ? Theme.paper : Theme.ink)
                            .frame(width: 28, height: 28)
                            .background(photo.useCutout ? Theme.ink : Theme.paper, in: Circle())
                    }
                    .accessibilityLabel(photo.useCutout ? "Background removed. Use original" : "Original. Remove background")
                    .padding(2)
                }
            }
    }
}
