import SwiftUI

/// The signed-in app, with the five tabs from the design spec (section 11.2):
/// Collection, Labels, +, Numbers, Account. Icons only.
/// The tab bar is the system's. The middle tab is a placeholder with a
/// circled-plus icon for emphasis: choosing it opens the Add sheet and leaves the selection where it was.
/// Labels and Numbers are empty screens until they are built.
struct AppShell: View {
    private enum Tab { case collection, labels, add, numbers, account }

    @State private var tab = Tab.collection
    @State private var showingAddSheet = false
    /// The flow chosen in the Add sheet; set while it closes, shown once it has.
    @State private var chosen: AddChoice?
    @State private var flow: AddChoice?
    @State private var reloadSignal = 0
    /// Bumped when a tasting is logged, so the Labels tab reloads its history.
    @State private var tastingSignal = 0

    var body: some View {
        TabView(selection: selection) {
            NavigationStack { CollectionView(reloadSignal: reloadSignal) }
                .tabItem { Self.icon("square.grid.2x2", label: "Collection") }
                .tag(Tab.collection)
            LabelsView(reloadSignal: tastingSignal)
                .tabItem { Self.icon("text.magnifyingglass", label: "Labels") }
                .tag(Tab.labels)
            Color.clear
                .tabItem { Self.icon("plus.app.fill", label: "Add") }
                .tag(Tab.add)
            NavigationStack { PlaceholderScreen(title: "Numbers") }
                .tabItem { Self.icon("chart.bar", label: "Numbers") }
                .tag(Tab.numbers)
            AccountView()
                .tabItem { Self.icon("person.circle", label: "Account") }
                .tag(Tab.account)
        }
        .background(Theme.paper)
        .sheet(isPresented: $showingAddSheet, onDismiss: { flow = chosen; chosen = nil }) {
            AddSheet { chosen = $0; showingAddSheet = false }
        }
        .sheet(item: $flow) { choice in
            switch choice {
            case .addBottle: AddBottleView { reloadSignal += 1; tab = .collection }
            case .logTasting: LogTastingFlow { tastingSignal += 1; tab = .labels }
            case .tonight: TonightFlow { tastingSignal += 1; tab = .labels }
            }
        }
    }

    /// Choosing the middle tab opens the sheet without ever changing the selection,
    /// so the bar's highlight has nothing to snap back from.
    private var selection: Binding<Tab> {
        Binding(
            get: { tab },
            set: { new in
                if new == .add { showingAddSheet = true } else { tab = new }
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
