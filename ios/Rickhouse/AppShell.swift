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
                .tabItem { Self.icon("square.grid.2x2.fill", label: "Collection") }
                .tag(Tab.collection)
            Color.clear
                .tabItem { Self.icon("plus.circle", label: "Add a bottle") }
                .tag(Tab.add)
            AccountView()
                .tabItem { Self.icon("person.circle.fill", label: "Account") }
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

    /// The bar sizes symbols itself and ignores imageScale, so each icon is drawn at a set size (24 pt setting, about 28 pt drawn).
    /// A template image, so the bar still tints it and fills the selection highlight behind it.
    private static func icon(_ symbol: String, label: String) -> some View {
        let config = UIImage.SymbolConfiguration(pointSize: 24, weight: .regular)
        let image = UIImage(systemName: symbol, withConfiguration: config) ?? UIImage()
        return Image(uiImage: image.withRenderingMode(.alwaysTemplate)).accessibilityLabel(label)
    }
}
