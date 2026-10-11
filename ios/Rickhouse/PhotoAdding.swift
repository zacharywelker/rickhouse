import PhotosUI
import SwiftUI

extension View {
    /// A camera button in the toolbar that offers the camera (when there is one) or the photo library,
    /// lifts the bottle off its background the way the add form does, and hands over the upload bytes.
    /// `upload` throws to show its message; the page reloads itself after it returns.
    func addsPhotos(_ title: String, upload: @escaping (UploadImage) async throws -> Void) -> some View {
        modifier(PhotoAdding(title: title, upload: upload))
    }
}

private struct PhotoAdding: ViewModifier {
    let title: String
    let upload: (UploadImage) async throws -> Void

    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var showLibrary = false
    @State private var uploading = false
    @State private var failure: String?

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button("Take photo", systemImage: "camera") { showCamera = true }
                        }
                        Button("Choose from library", systemImage: "photo.on.rectangle") { showLibrary = true }
                    } label: {
                        if uploading { ProgressView() } else { Image(systemName: "camera") }
                    }
                    .disabled(uploading)
                    .accessibilityLabel(title)
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { send($0) }.ignoresSafeArea()
            }
            .photosPicker(isPresented: $showLibrary, selection: $pickerItem, matching: .images)
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                pickerItem = nil
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        send(image)
                    } else {
                        failure = "That photo couldn't be opened."
                    }
                }
            }
            .alert("The photo wasn't saved", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(failure ?? "")
            }
    }

    /// Same encoding as the add form: the cutout as PNG when Vision finds the bottle, else the photo as JPEG.
    private func send(_ image: UIImage) {
        uploading = true
        Task {
            defer { uploading = false }
            let cut = await Task.detached { image.cutout() }.value
            var photo = FormPhoto(original: image)
            photo.cutout = cut
            guard let bytes = photo.encoded() else { failure = "That photo couldn't be read."; return }
            do { try await upload(bytes) } catch { failure = error.localizedDescription }
        }
    }
}
