import SwiftUI

/// The signed-in app: Collection and Account, with the raised + between them.
/// The other tabs in the design (Labels, Numbers) arrive with their screens.
/// The + opens Add a bottle directly; it becomes the three-choice sheet once
/// there is a tasting log and Tonight to choose from.
struct AppShell: View {
    private enum Tab { case collection, account }

    @State private var tab = Tab.collection
    @State private var adding = false
    @State private var reloadSignal = 0

    var body: some View {
        ZStack {
            NavigationStack { CollectionView(reloadSignal: reloadSignal) }
                .opacity(tab == .collection ? 1 : 0)
                .accessibilityHidden(tab != .collection)
            AccountView()
                .opacity(tab == .account ? 1 : 0)
                .accessibilityHidden(tab != .account)
        }
        .background(Theme.paper)
        .safeAreaInset(edge: .bottom, spacing: 0) { tabBar }
        .sheet(isPresented: $adding) {
            AddBottleView { reloadSignal += 1; tab = .collection }
        }
    }

    private var tabBar: some View {
        HStack(alignment: .top) {
            tabButton("Collection", symbol: "square.grid.2x2", selected: tab == .collection) { tab = .collection }
            Button { adding = true } label: {
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Theme.paper)
                    .frame(width: 58, height: 58)
                    .background(Theme.ink, in: Circle())
                    .overlay(Circle().strokeBorder(Theme.paper, lineWidth: 3))
            }
            .accessibilityLabel("Add a bottle")
            .offset(y: -16)
            .frame(maxWidth: .infinity, minHeight: 44)
            tabButton("Account", symbol: "person.circle.fill", selected: tab == .account) { tab = .account }
        }
        .padding(.top, 2)
        .background(Theme.paper.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.2)).frame(height: 1) }
    }

    private func tabButton(_ name: String, symbol: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 24, weight: .regular))
                .foregroundStyle(selected ? Theme.ink : Theme.muted)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .accessibilityLabel(name)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
