import SwiftUI
import UIKit

/// One photo in the viewer. `id` is the bottle photo's id; a label's single photo has none.
struct ViewerPhoto: Identifiable, Equatable {
    let id: Int
    let path: String
    var isHero: Bool
}

/// Full-screen photos you can swipe between, share, delete, and (for a bottle's photos) make the hero shot.
struct PhotoViewer: View {
    enum Subject: Equatable {
        case bottle
        /// A label has the one photo, so there is no hero to choose; deleting removes it from the label.
        case label(expressionId: Int)
    }

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let subject: Subject
    let title: String
    @State var photos: [ViewerPhoto]
    @State var selection: Int
    /// Something changed on the server, so the screen behind should reload.
    var onChanged: () -> Void

    @State private var shareImage: UIImage?
    @State private var confirmingDelete = false
    @State private var busy = false
    @State private var problem: String?

    private var current: ViewerPhoto? { photos.first { $0.id == selection } }

    var body: some View {
        NavigationStack {
            TabView(selection: $selection) {
                ForEach(photos) { photo in
                    AuthenticatedImage(path: photo.path, contentMode: .fit, background: .clear)
                        .padding(.vertical, 8)
                        .tag(photo.id)
                        .accessibilityLabel(photo.isHero ? "\(title), hero photo" : title)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .automatic : .never))
            .background(Theme.ink.ignoresSafeArea())
            .toolbarBackground(Theme.ink, for: .navigationBar, .bottomBar)
            .toolbarBackground(.visible, for: .navigationBar, .bottomBar)
            .toolbarColorScheme(.dark, for: .navigationBar, .bottomBar)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItemGroup(placement: .bottomBar) {
                    if let shareImage, let current {
                        ShareLink(item: Image(uiImage: shareImage), preview: SharePreview(title, image: Image(uiImage: shareImage))) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                        .accessibilityIdentifier("share-\(current.id)")
                    } else {
                        Label("Share", systemImage: "square.and.arrow.up").foregroundStyle(.secondary)
                    }
                    Spacer()
                    if case .bottle = subject, let current {
                        Button { setHero(current) } label: {
                            Label(current.isHero ? "Hero shot" : "Make hero", systemImage: current.isHero ? "star.fill" : "star")
                        }
                        .disabled(current.isHero || busy)
                        Spacer()
                    }
                    Button(role: .destructive) { confirmingDelete = true } label: { Label("Delete", systemImage: "trash") }
                        .disabled(busy)
                }
            }
            .task(id: current?.path) { await loadShareImage() }
            .confirmSheet("Delete this photo?", message: "This can't be undone.", confirm: "Delete photo", isPresented: $confirmingDelete, perform: delete)
            .alert("Something went wrong", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(problem ?? "")
            }
        }
    }

    private func loadShareImage() async {
        shareImage = nil
        guard let path = current?.path, let api = session.api, let data = try? await api.imageData(path: path) else { return }
        shareImage = UIImage(data: data)
    }

    private func setHero(_ photo: ViewerPhoto) {
        run {
            try await $0.setHeroPhoto(id: photo.id)
            photos = photos.map { ViewerPhoto(id: $0.id, path: $0.path, isHero: $0.id == photo.id) }
        }
    }

    private func delete() {
        guard let photo = current else { return }
        run { api in
            switch subject {
            case .bottle: try await api.deleteBottlePhoto(id: photo.id)
            case .label(let expressionId): try await api.deleteLabelPhoto(expressionId: expressionId)
            }
            photos.removeAll { $0.id == photo.id }
            // The server hands the hero to the next photo when the hero goes.
            if case .bottle = subject, photo.isHero, !photos.isEmpty, !photos.contains(where: \.isHero) { photos[0].isHero = true }
            if let next = photos.first { selection = next.id } else { dismiss() }
        }
    }

    private func run(_ work: @escaping (APIClient) async throws -> Void) {
        guard let api = session.api, !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                try await work(api)
                onChanged()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }
}
