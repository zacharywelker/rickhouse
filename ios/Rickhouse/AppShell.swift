import SwiftUI

/// The signed-in app, with the five tabs from the design spec (section 11.2):
/// Collection, Labels, +, Numbers, Account. Icons only.
/// The tab bar is the system's. The middle tab is a placeholder with a
/// circled-plus icon for emphasis: choosing it opens the Add sheet and leaves the selection where it was.
struct AppShell: View {
    private enum Destination { case collection, labels, add, numbers, account }

    @State private var tab = Destination.collection
    @State private var showingAddSheet = false
    /// The flow chosen in the Add sheet; set while it closes, shown once it has.
    @State private var chosen: AddChoice?
    @State private var flow: AddChoice?
    /// The barcode lookup, full screen so its scanner is the first thing to slide up.
    @State private var scanning = false
    @State private var reloadSignal = 0
    /// Bumped when a tasting is logged, so the Labels tab reloads its history.
    @State private var tastingSignal = 0

    var body: some View {
        TabView(selection: selection) {
            Tab(value: Destination.collection) {
                NavigationStack { CollectionView(reloadSignal: reloadSignal) }
            } label: { Self.icon("square.grid.2x2", label: "Collection") }
            Tab(value: Destination.labels) {
                LabelsView(reloadSignal: tastingSignal)
            } label: { Self.icon("text.magnifyingglass", label: "Labels") }
            Tab(value: Destination.add) {
                Color.clear
            } label: { Self.icon("plus.app.fill", label: "Add") }
            Tab(value: Destination.numbers) {
                NumbersView()
            } label: { Self.icon("chart.bar", label: "Numbers") }
            Tab(value: Destination.account) {
                AccountView()
            } label: { Self.icon("person.circle", label: "Account") }
        }
        .background(Theme.paper)
        .sheet(isPresented: $showingAddSheet, onDismiss: {
            if chosen == .scan { scanning = true } else { flow = chosen }
            chosen = nil
        }) {
            AddSheet { chosen = $0; showingAddSheet = false }
        }
        .fullScreenCover(isPresented: $scanning) { BarcodeLookupView { reloadSignal += 1 } }
        .sheet(item: $flow) { choice in
            switch choice {
            case .addBottle: AddBottleView { reloadSignal += 1; tab = .collection }
            case .scan: EmptyView()
            case .logTasting: LogTastingFlow { tastingSignal += 1; tab = .labels }
            case .tonight: TonightFlow { tastingSignal += 1; tab = .labels }
            }
        }
    }

    /// Choosing the middle tab opens the sheet without ever changing the selection,
    /// so the bar's highlight has nothing to snap back from.
    private var selection: Binding<Destination> {
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
