import SwiftUI

@main
struct RickhouseApp: App {
    @State private var session = Session()

    init() { Fonts.register() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(.light)  // dark mode isn't designed yet
                .tint(Theme.ink)
        }
    }
}

struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        Group {
            if session.isSignedIn {
                AppShell()
            } else {
                SignInView()
            }
        }
        .task { await session.restore() }
    }
}
