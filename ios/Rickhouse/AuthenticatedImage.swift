import SwiftUI
import UIKit

/// Photos sit behind the login, so `AsyncImage` can't fetch them. This one
/// sends the Bearer token and keeps what it has seen in memory.
struct AuthenticatedImage: View {
    @Environment(Session.self) private var session
    let path: String?
    @State private var image: UIImage?

    private static let cache = NSCache<NSString, UIImage>()

    var body: some View {
        ZStack {
            Color(.secondarySystemFill)
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "wineglass").foregroundStyle(.secondary)
            }
        }
        .clipped()
        .task(id: path) { await load() }
    }

    private func load() async {
        guard let path, let api = session.api else { image = nil; return }
        if let cached = Self.cache.object(forKey: path as NSString) { image = cached; return }
        guard let data = try? await api.imageData(path: path), let loaded = UIImage(data: data) else { return }
        Self.cache.setObject(loaded, forKey: path as NSString)
        image = loaded
    }
}
