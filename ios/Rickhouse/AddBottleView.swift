import PhotosUI
import SwiftUI

/// Pick a label, fill in what you know, add photos, save. The label must
/// already exist; creating new labels stays in the web app for now.
struct AddBottleView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    var onSaved: () -> Void

    @State private var label: LabelOption?
    @State private var picking = false
    @State private var price = ""
    @State private var acquired = Date()
    @State private var includeDate = true
    @State private var batch = ""
    @State private var location = ""
    @State private var notes = ""
    @State private var photos: [UIImage] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var saving = false
    @State private var error: String?
    /// Set once the bottle exists, so a retry after a failed photo upload
    /// only re-sends the photos instead of adding the bottle twice.
    @State private var createdId: Int?

    var body: some View {
        NavigationStack {
            Form {
                Section("Label") {
                    Button { picking = true } label: {
                        HStack {
                            Text(label?.title ?? "Choose a label").foregroundStyle(label == nil ? .secondary : .primary)
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                }
                Section("Purchase") {
                    TextField("Price paid", text: $price).keyboardType(.decimalPad)
                    Toggle("Date acquired", isOn: $includeDate)
                    if includeDate { DatePicker("Date", selection: $acquired, in: ...Date(), displayedComponents: .date) }
                }
                Section("Details") {
                    TextField("Batch", text: $batch)
                    TextField("Where it's kept", text: $location)
                    TextField("Notes", text: $notes, axis: .vertical)
                }
                Section("Photos") {
                    if !photos.isEmpty {
                        ScrollView(.horizontal) {
                            HStack {
                                ForEach(photos.indices, id: \.self) { i in
                                    Image(uiImage: photos[i]).resizable().scaledToFill()
                                        .frame(width: 80, height: 100).clipShape(RoundedRectangle(cornerRadius: 6))
                                }
                            }
                        }
                    }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Take photo", systemImage: "camera") { showCamera = true }
                    }
                    PhotosPicker("Choose from library", selection: $pickerItems, maxSelectionCount: 6, matching: .images)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Add bottle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : error == nil ? "Save" : "Retry", action: save).disabled(label == nil || saving)
                }
            }
            .sheet(isPresented: $picking) { LabelPickerView { label = $0 } }
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
    }

    private func save() {
        guard let label, let api = session.api else { return }
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
                dismiss()
            } catch {
                // The form and photos stay, so nothing is lost to a bad connection.
                self.error = createdId == nil
                    ? error.localizedDescription
                    : "The bottle was saved, but its photos weren't: \(error.localizedDescription)"
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

struct LabelPickerView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    var onPick: (LabelOption) -> Void
    @State private var query = ""
    @State private var results: [LabelOption] = []
    @State private var failure: String?
    @State private var attempt = 0

    var body: some View {
        NavigationStack {
            List(results) { option in
                Button {
                    onPick(option)
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        AuthenticatedImage(path: option.thumbPath)
                            .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 6))
                        VStack(alignment: .leading) {
                            Text(option.title).foregroundStyle(.primary)
                            Text(option.category).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .overlay {
                // A failed search is not an empty one: say so, and let them retry.
                if let failure {
                    ContentUnavailableView {
                        Label("Couldn't load labels", systemImage: "wifi.slash")
                    } description: {
                        Text(failure)
                    } actions: {
                        Button("Try again") { attempt += 1 }
                    }
                } else if results.isEmpty {
                    ContentUnavailableView.search(text: query)
                }
            }
            .navigationTitle("Choose a label")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Brand or name")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .task(id: "\(query)#\(attempt)") {
                try? await Task.sleep(for: .milliseconds(200))
                guard !Task.isCancelled, let api = session.api else { return }
                do {
                    results = try await api.labels(matching: query)
                    failure = nil
                } catch APIError.unauthorized {
                    session.signOut()
                } catch {
                    // A newer keystroke cancels this request; that isn't a failure.
                    guard !Task.isCancelled else { return }
                    results = []
                    failure = error.localizedDescription
                }
            }
        }
    }
}

/// The system camera; `UIImagePickerController` is still the simplest way to take one photo.
struct CameraPicker: UIViewControllerRepresentable {
    var onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onCapture(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

extension UIImage {
    /// Fits within `maxEdge` points on the long side, keeping aspect; unchanged if already smaller.
    func scaled(maxEdge: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxEdge else { return self }
        let ratio = maxEdge / longest
        let target = CGSize(width: size.width * ratio, height: size.height * ratio)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}
