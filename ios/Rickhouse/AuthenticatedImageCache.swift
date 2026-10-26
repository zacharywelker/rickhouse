import Foundation
import UIKit

struct ImageRequestID: Hashable {
    let sessionID: UUID
    let serverURL: URL?
    let path: String?

    fileprivate var cacheKey: NSString {
        // Length prefixes keep URL/path delimiters from creating ambiguous keys.
        let server = serverURL?.absoluteString ?? ""
        let path = path ?? ""
        return "\(sessionID)|\(server.utf8.count):\(server)\(path.utf8.count):\(path)" as NSString
    }
}

@MainActor
final class AuthenticatedImageCache {
    private let cache = NSCache<NSString, UIImage>()

    func image(for request: ImageRequestID) -> UIImage? { cache.object(forKey: request.cacheKey) }
    func insert(_ image: UIImage, for request: ImageRequestID) { cache.setObject(image, forKey: request.cacheKey) }
}
