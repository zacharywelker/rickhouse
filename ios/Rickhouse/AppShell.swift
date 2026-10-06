import SwiftUI

/// The signed-in app: Collection and Account, with the + between them.
/// The other tabs in the design (Labels, Numbers) arrive with their screens.
/// The tab bar is the system's. The middle tab is a placeholder with a
/// circled-plus icon for emphasis: choosing it opens Add a bottle and leaves the selection where it was.
/// The + opens Add a bottle directly; it becomes the three-choice sheet once
/// there is a tasting log and Tonight to choose from.
struct AppShell: View {
    private enum Tab { case collection, add, account }

    @State private var tab = Tab.collection
    @State private var adding = false
    @State private var reloadSignal = 0

    var body: some View {
        TabView(selection: selection) {
            NavigationStack { CollectionView(reloadSignal: reloadSignal) }
                .tabItem { Label("Collection", systemImage: "square.grid.2x2").labelStyle(.iconOnly) }
                .tag(Tab.collection)
            Color.clear
                .tabItem {
                    // The bar fills symbols on its own; the outline is the point here.
                    Label("Add a bottle", systemImage: "plus.circle").labelStyle(.iconOnly)
                        .environment(\.symbolVariants, .none)
                }
                .tag(Tab.add)
            AccountView()
                .tabItem { Label("Account", systemImage: "person.circle.fill").labelStyle(.iconOnly) }
                .tag(Tab.account)
        }
        .background(Theme.paper)
        .sheet(isPresented: $adding) {
            AddBottleView { reloadSignal += 1; tab = .collection }
        }
    }

    /// Choosing the middle tab opens the sheet without ever changing the selection,
    /// so the bar's highlight has nothing to snap back from.
    private var selection: Binding<Tab> {
        Binding(
            get: { tab },
            set: { new in
                if new == .add { adding = true } else { tab = new }
            }
        )
    }
}
