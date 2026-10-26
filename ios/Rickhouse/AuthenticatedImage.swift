import SwiftUI
import UIKit

/// Photos sit behind the login, so `AsyncImage` can't fetch them. This one
/// sends the Bearer token and keeps what it has seen in memory.
struct AuthenticatedImage: View {
    @Environment(Session.self) private var session
    let path: String?
    /// `.fit` keeps the whole picture, as a cut-out bottle needs; `.fill` crops to the frame.
    var contentMode: ContentMode = .fill
    /// What shows behind a picture that doesn't fill its frame.
    var background: Color = Color(.secondarySystemFill)
    /// Where a picture that doesn't fill its frame sits; `.bottom` stands a cut-out bottle on its base.
    var alignment: Alignment = .center
    /// Called when the fetch fails, so a caller can fall back to another picture.
    var onFailure: (() -> Void)?
    @State private var image: UIImage?
    @State private var imageRequest: ImageRequestID?
    /// The fetch failed; shows a different glyph. It runs again when the view is next created.
    @State private var failed = false

    private static let cache = AuthenticatedImageCache()

    private var requestID: ImageRequestID {
        ImageRequestID(sessionID: session.id, serverURL: session.serverURL, path: path)
    }

    var body: some View {
        ZStack {
            background
            if let image, imageRequest == requestID {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            } else {
                Image(systemName: failed ? "photo.badge.exclamationmark" : "wineglass").foregroundStyle(.secondary)
            }
        }
        .clipped()
        .task(id: requestID) {
            let request = requestID
            await load(request)
        }
    }

    private func load(_ request: ImageRequestID) async {
        guard !Task.isCancelled, requestID == request else { return }
        imageRequest = request
        image = nil
        failed = false
        guard let path = request.path, let api = session.api else { return }
        if let cached = Self.cache.image(for: request) { image = cached; return }
        do {
            let data = try await api.imageData(path: path)
            guard !Task.isCancelled, requestID == request else { return }
            guard let loaded = UIImage(data: data) else {
                failed = true
                onFailure?()
                return
            }
            Self.cache.insert(loaded, for: request)
            image = loaded
        } catch {
            guard !Task.isCancelled, requestID == request, !APIError.isCancellation(error) else { return }
            failed = true
            onFailure?()
        }
    }
}
