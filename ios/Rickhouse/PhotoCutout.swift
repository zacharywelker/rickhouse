import CoreImage
import UIKit
import Vision

/// One photo in the bottle form: what the camera gave us, plus the background-removed version once Vision has made one.
struct FormPhoto: Identifiable, Sendable {
    let id = UUID()
    let original: UIImage
    var cutout: UIImage?
    var useCutout = true
    var working = true

    /// What gets shown and uploaded.
    var chosen: UIImage { useCutout ? (cutout ?? original) : original }

    /// The upload bytes: a cutout goes as PNG to keep its transparency, an ordinary photo as JPEG.
    fileprivate func encoded() -> UploadImage? {
        if useCutout, let cutout {
            return cutout.scaled(maxEdge: 2000).pngData().map { UploadImage(data: $0, mime: "image/png", ext: "png") }
        }
        return original.scaled(maxEdge: 2000).jpegData(compressionQuality: 0.85).map { UploadImage(data: $0, mime: "image/jpeg", ext: "jpg") }
    }
}

struct UploadImage: Sendable {
    let data: Data
    let mime: String
    let ext: String
}

/// Serializes expensive image work off the UI actor, including batches of selected photos.
/// These methods don't suspend internally, so only one image is processed at a time.
actor PhotoProcessor {
    static let shared = PhotoProcessor()

    func cutout(_ image: UIImage) throws -> UIImage? {
        try Task.checkCancellation()
        let result = autoreleasepool { image.cutout() }
        try Task.checkCancellation()
        return result
    }

    func encode(_ photo: FormPhoto) throws -> UploadImage {
        try Task.checkCancellation()
        guard let result = autoreleasepool(invoking: { photo.encoded() }) else {
            throw APIError.server("That photo couldn't be read.")
        }
        try Task.checkCancellation()
        return result
    }

    func encode(_ photos: [FormPhoto]) throws -> [UploadImage] {
        try photos.map { try encode($0) }
    }

    func prepare(_ image: UIImage) throws -> UploadImage {
        var photo = FormPhoto(original: image)
        photo.cutout = try cutout(image)
        return try encode(photo)
    }
}

extension UIImage {
    /// The subject (the bottle) lifted off its background, transparent around it, or nil when Vision finds nothing.
    /// Runs the same model as Photos' "Lift subject"; call off the main actor.
    func cutout() -> UIImage? {
        // Redraw first so the pixels are upright (Vision ignores UIImage.imageOrientation) and the work is cheap.
        let upright = scaled(maxEdge: 1600).normalized()
        guard let cg = upright.cgImage else { return nil }
        let handler = VNImageRequestHandler(cgImage: cg)
        let request = VNGenerateForegroundInstanceMaskRequest()
        guard (try? handler.perform([request])) != nil,
              let found = request.results?.first, !found.allInstances.isEmpty,
              let buffer = try? found.generateMaskedImage(ofInstances: found.allInstances, from: handler, croppedToInstancesExtent: false)
        else { return nil }
        let subject = CIImage(cvPixelBuffer: buffer)
        guard let out = CIContext().createCGImage(subject, from: subject.extent) else { return nil }
        return UIImage(cgImage: out)
    }

    /// Same picture with the orientation baked into the pixels.
    func normalized() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in draw(at: .zero) }
    }
}
