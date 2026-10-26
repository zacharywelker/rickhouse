import PhotosUI
import SwiftUI

/// Add a bottle: the photo and the same sections the bottle page edits (BottleForm.swift), with the release and
/// own-proof sections behind "More details" so a quick add stays quick.
struct BottleFormView: View {
    @Environment(Session.self) private var session

    /// Closes the whole Add a bottle sheet after a save.
    var onSaved: () -> Void

    @State private var draft: BottleDraft
    @State private var fieldErrors: [String: String] = [:]
    @State private var photos: [FormPhoto] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var saving = false
    @State private var error: String?
    /// Set once the bottle exists, so a retry after a failed photo upload
    /// only re-sends the photos instead of adding the bottle twice.
    @State private var createdId: Int?

    init(label: LabelOption, onSaved: @escaping () -> Void) {
        self.onSaved = onSaved
        // Today unless cleared: most bottles are logged the day they come home.
        _draft = State(initialValue: BottleDraft.new(label: label, today: Format.isoDay(Date())))
    }

    var body: some View {
        Form {
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
            BottleFormSections(draft: $draft, errors: fieldErrors)
                .disabled(createdId != nil)
            if let error { Section { ErrorText(error) } }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("Add bottle")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(saving ? "Saving…" : error == nil ? "Save" : "Retry", action: save)
                    .disabled(saving || photos.contains(where: \.working))
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
        .task(id: photos.map(\.id)) {
            for photo in photos where photo.working {
                do {
                    let cut = try await PhotoProcessor.shared.cutout(photo.original)
                    try Task.checkCancellation()
                    guard let i = photos.firstIndex(where: { $0.id == photo.id }) else { continue }
                    photos[i].cutout = cut
                    photos[i].working = false
                } catch { return }
            }
        }
    }

    /// Shows the photo at once, then swaps in the cutout if Vision can make one.
    private func add(_ image: UIImage) {
        photos.append(FormPhoto(original: image))
    }

    private func save() {
        guard let api = session.api else { return }
        if createdId == nil {
            let found = draft.errors(today: Format.isoDay(Date()))
            guard found.isEmpty else {
                fieldErrors = Dictionary(uniqueKeysWithValues: found.map { ($0.key.rawValue, $0.value) })
                error = "Check the highlighted fields."
                return
            }
        }
        fieldErrors = [:]
        saving = true
        error = nil
        Task {
            do {
                let id: Int
                if let createdId {
                    id = createdId
                } else {
                    id = try await api.createBottle(draft.patch())
                    createdId = id
                }
                if !photos.isEmpty {
                    // Downscaled so a 12 MP photo doesn't cross the home network at full size.
                    // A cutout goes as PNG so the server keeps its transparency and crops to the bottle.
                    let images = try await PhotoProcessor.shared.encode(photos)
                    try await api.uploadImages(bottleId: id, images: images)
                }
                onSaved()
            } catch APIError.unauthorized {
                session.signOut()
            } catch APIError.invalid(_, let message, let fields) where createdId == nil {
                fieldErrors = fields
                self.error = message
                saving = false
            } catch {
                // The form and photos stay, so nothing is lost to a bad connection.
                self.error = createdId == nil
                    ? error.localizedDescription
                    : "The bottle was saved, but its photos weren't: \(error.localizedDescription)"
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
