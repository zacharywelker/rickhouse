import SwiftUI

@main
struct RickhouseApp: App {
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
    }
}

struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        Group {
            if session.isSignedIn {
                NavigationStack { CollectionView() }
            } else {
                SignInView()
            }
        }
        .task { await session.restore() }
    }
}
