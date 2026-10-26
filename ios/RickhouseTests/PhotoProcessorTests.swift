import UIKit
import XCTest
@testable import Rickhouse

@MainActor
final class PhotoProcessorTests: XCTestCase {
    private func image(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width / 2, height: height))
        }
    }

    func testCutoutUploadsAsPNGAndKeepsTransparency() async throws {
        let original = image(width: 40, height: 60)
        var photo = FormPhoto(original: original)
        photo.cutout = image(width: 20, height: 30)

        let encoded = try await PhotoProcessor.shared.encode(photo)
        XCTAssertEqual(encoded.mime, "image/png")
        XCTAssertEqual(encoded.ext, "png")
        let decoded = try XCTUnwrap(UIImage(data: encoded.data))
        XCTAssertEqual(decoded.size, CGSize(width: 20, height: 30))
        let cgImage = try XCTUnwrap(decoded.cgImage)
        XCTAssertTrue([CGImageAlphaInfo.first, .last, .premultipliedFirst, .premultipliedLast].contains(cgImage.alphaInfo))
    }

    func testChoosingOriginalUploadsJPEGInsteadOfCutout() async throws {
        var photo = FormPhoto(original: image(width: 40, height: 60))
        photo.cutout = image(width: 20, height: 30)
        photo.useCutout = false

        let encoded = try await PhotoProcessor.shared.encode(photo)
        XCTAssertEqual(encoded.mime, "image/jpeg")
        XCTAssertEqual(encoded.ext, "jpg")
        let decoded = try XCTUnwrap(UIImage(data: encoded.data))
        XCTAssertEqual(decoded.size, CGSize(width: 40, height: 60))
    }

    func testBatchPreservesOrderAndDownscalesLargePhotos() async throws {
        let photos = [
            FormPhoto(original: image(width: 2400, height: 1200)),
            FormPhoto(original: image(width: 20, height: 40)),
        ]
        let encoded = try await PhotoProcessor.shared.encode(photos)
        let sizes = try encoded.map { try XCTUnwrap(UIImage(data: $0.data)).size }
        XCTAssertEqual(sizes, [CGSize(width: 2000, height: 1000), CGSize(width: 20, height: 40)])
    }

    func testCancelledProcessingThrowsInsteadOfReturningUploadBytes() async throws {
        let photo = FormPhoto(original: image(width: 40, height: 60))
        // The task inherits the main actor, so it cannot start before we cancel it here.
        let task = Task { try await PhotoProcessor.shared.encode(photo) }
        task.cancel()
        do {
            _ = try await task.value
            XCTFail("Cancelled processing must not produce an upload.")
        } catch is CancellationError {
            // Expected; no timing or Vision model dependency.
        }
    }
}
