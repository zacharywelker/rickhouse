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
    /// The fetch failed; shows a different glyph. It runs again when the view is next created.
    @State private var failed = false

    private static let cache = NSCache<NSString, UIImage>()

    var body: some View {
        ZStack {
            background
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            } else {
                Image(systemName: failed ? "photo.badge.exclamationmark" : "wineglass").foregroundStyle(.secondary)
            }
        }
        .clipped()
        .task(id: path) { await load() }
    }

    private func load() async {
        failed = false
        guard let path, let api = session.api else { image = nil; return }
        if let cached = Self.cache.object(forKey: path as NSString) { image = cached; return }
        guard let data = try? await api.imageData(path: path), let loaded = UIImage(data: data) else {
            failed = !Task.isCancelled
            if failed { onFailure?() }
            return
        }
        Self.cache.setObject(loaded, forKey: path as NSString)
        image = loaded
    }
}
