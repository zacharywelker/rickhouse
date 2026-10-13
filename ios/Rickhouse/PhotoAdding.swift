import PhotosUI
import SwiftUI

/// The last slot in a page's photos: a dashed tile that offers the camera (when there is one) or the photo
/// library, lifts the bottle off its background the way the add form does, and hands over the upload bytes.
/// `upload` throws; the message goes to `foot`, the page's bar, because a tile this small cannot show its own.
struct AddPhotoTile: View {
    let foot: FootBar
    let title: String
    let size: CGSize
    let upload: (UploadImage) async throws -> Void

    @State private var showCamera = false
    @State private var showLibrary = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var uploading = false

    var body: some View {
        Menu {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("Take photo", systemImage: "camera") { showCamera = true }
            }
            Button("Choose from library", systemImage: "photo.on.rectangle") { showLibrary = true }
        } label: {
            Rectangle()
                .strokeBorder(Theme.ink.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                .frame(width: size.width, height: size.height)
                .overlay {
                    if uploading { ProgressView() } else {
                        Image(systemName: "camera").font(.system(size: min(24, size.width / 2))).foregroundStyle(Theme.muted)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(uploading)
        .accessibilityLabel(title)
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
                    foot.fail("That photo couldn't be opened.") { showLibrary = true }
                }
            }
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
            guard let bytes = photo.encoded() else { foot.fail("That photo couldn't be read.") { showLibrary = true }; return }
            do { try await upload(bytes) } catch { foot.fail("The photo wasn't saved: \(error.localizedDescription)") { send(image) } }
        }
    }
}
