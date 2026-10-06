import PhotosUI
import SwiftUI

/// Add a bottle: find the label (by name or barcode), start a new one if there is none,
/// then fill in the bottle. See the design spec, section 11.4.
struct AddBottleView: View {
    @Environment(\.dismiss) private var dismiss
    var onSaved: () -> Void

    private enum Step: Hashable {
        case newLabel(code: String?, name: String)
        case bottle(LabelOption)
    }

    @Environment(Session.self) private var session
    @State private var path: [Step] = []

    var body: some View {
        NavigationStack(path: $path) {
            FindLabelView(
                onPick: { label, code in choose(label, savingCode: code) },
                onNewLabel: { code, name in path.append(.newLabel(code: code, name: name)) }
            )
            .navigationDestination(for: Step.self) { step in
                switch step {
                case .newLabel(let code, let name):
                    NewLabelView(code: code, name: name) { label in
                        // The new label already carries the code; the name search is not part of the way back.
                        path = [.bottle(label)]
                    }
                case .bottle(let label):
                    BottleFormView(label: label) { onSaved(); dismiss() }
                }
            }
        }
    }

    /// Goes on to the bottle. A barcode that found no label is saved onto the one picked, so the next scan finds it;
    /// that is best effort and never holds up adding the bottle.
    private func choose(_ label: LabelOption, savingCode code: String?) {
        if let code, label.upc == nil, let api = session.api {
            Task { try? await api.attachBarcode(labelId: label.id, code: code) }
        }
        path.append(.bottle(label))
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
