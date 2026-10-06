import SwiftUI

/// What the + offers (design spec section 11.3).
enum AddChoice: String, Identifiable, CaseIterable {
    case addBottle, logTasting, tonight

    var id: String { rawValue }

    var title: String {
        switch self {
        case .addBottle: "Add a bottle"
        case .logTasting: "Log a tasting"
        case .tonight: "What to drink tonight"
        }
    }

    var detail: String {
        switch self {
        case .addBottle: "Put a new bottle in your collection."
        case .logTasting: "Record a pour, yours or not."
        case .tonight: "Let the collection pick for you."
        }
    }

    var symbol: String {
        switch self {
        case .addBottle: "plus.circle"
        case .logTasting: "wineglass"
        case .tonight: "moon.stars"
        }
    }
}

/// The small sheet the + opens: three plain rows. Choosing one closes the sheet;
/// the shell then presents that flow.
struct AddSheet: View {
    var onChoose: (AddChoice) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(AddChoice.allCases) { choice in
                Button { onChoose(choice) } label: {
                    HStack(spacing: 16) {
                        Image(systemName: choice.symbol)
                            .font(.system(size: 24))
                            .foregroundStyle(Theme.ink)
                            .frame(width: 32)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(choice.title).font(.inter(17, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                            Text(choice.detail).font(.inter(14, relativeTo: .subheadline)).foregroundStyle(Theme.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if choice != AddChoice.allCases.last { Divider() }
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.paper)
        // Fixed height for the default text size; the large detent is there for bigger text.
        .presentationDetents([.height(320), .large])
        .presentationDragIndicator(.visible)
    }
}

/// A screen that exists in the navigation but has nothing on it yet.
struct PlaceholderScreen: View {
    let title: String

    var body: some View {
        Theme.paper
            .ignoresSafeArea()
            .navigationTitle(title)
    }
}

/// Log a tasting and What to drink tonight, until their flows are built.
struct ComingSoonSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String

    var body: some View {
        NavigationStack {
            PlaceholderScreen(title: title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }
}
