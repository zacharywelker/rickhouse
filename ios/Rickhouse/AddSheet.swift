import SwiftUI

/// What the + offers (design spec section 11.3).
enum AddChoice: String, Identifiable, CaseIterable {
    case addBottle, scan, logTasting, tonight

    var id: String { rawValue }

    var title: String {
        switch self {
        case .addBottle: "Add a bottle"
        case .scan: "Look up a barcode"
        case .logTasting: "Log a tasting"
        case .tonight: "What to drink tonight"
        }
    }

    var detail: String {
        switch self {
        case .addBottle: "Put a new bottle in your collection."
        case .scan: "Scan a bottle to find its label."
        case .logTasting: "Record a pour, yours or not."
        case .tonight: "Let the collection pick for you."
        }
    }

    var symbol: String {
        switch self {
        case .addBottle: "plus.circle"
        case .scan: "barcode.viewfinder"
        case .logTasting: "wineglass"
        case .tonight: "moon.stars"
        }
    }
}

/// The small sheet the + opens: one plain row per choice. Choosing one closes the sheet;
/// the shell then presents that flow.
struct AddSheet: View {
    var onChoose: (AddChoice) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        ScrollView {
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
                    .padding(.vertical, 20)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if choice != AddChoice.allCases.last { Divider() }
            }
          }
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.paper)
        // Fixed height for the default text size; at accessibility sizes four options no longer fit in it, so it opens full.
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.height(380), .large])
        .presentationDragIndicator(.visible)
    }
}
