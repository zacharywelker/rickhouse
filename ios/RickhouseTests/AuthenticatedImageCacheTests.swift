import XCTest
import UIKit
@testable import Rickhouse

@MainActor
final class AuthenticatedImageCacheTests: XCTestCase {
    func testSamePathIsIsolatedByServerAndSession() {
        let cache = AuthenticatedImageCache()
        let session = UUID()
        let first = ImageRequestID(sessionID: session, serverURL: URL(string: "https://one.example")!, path: "photo.jpg")
        let otherServer = ImageRequestID(sessionID: session, serverURL: URL(string: "https://two.example")!, path: "photo.jpg")
        let otherSession = ImageRequestID(sessionID: UUID(), serverURL: first.serverURL, path: first.path)
        let image = UIImage()
        cache.insert(image, for: first)
        XCTAssertTrue(cache.image(for: first) === image)
        XCTAssertNil(cache.image(for: otherServer))
        XCTAssertNil(cache.image(for: otherSession))
    }
}
