import SwiftUI

/// Swipe right to left to reveal a red Delete, as a `List` row does, for rows that sit in a ScrollView.
/// The row needs to be opaque (it slides over the button), so it gets the paper behind it.
private struct SwipeToDelete: ViewModifier {
    let action: () -> Void
    private static let width: CGFloat = 88

    @State private var offset: CGFloat = 0
    /// Where the row rested when the drag began: open or closed.
    @State private var restingOffset: CGFloat = 0

    func body(content: Content) -> some View {
        ZStack(alignment: .trailing) {
            Button(role: .destructive) {
                close()
                action()
            } label: {
                Text("Delete")
                    .font(.inter(15, .semibold, relativeTo: .subheadline))
                    .foregroundStyle(Theme.paper)
                    .frame(width: Self.width)
                    .frame(maxHeight: .infinity)
                    .background(Theme.error)
            }
            .buttonStyle(.plain)
            .opacity(offset < 0 ? 1 : 0)
            .accessibilityHidden(true)

            content
                .background(Theme.paper)
                .offset(x: offset)
                .allowsHitTesting(offset == 0)
                .overlay {
                    // An open row closes on a tap instead of opening whatever it holds.
                    if offset != 0 { Color.clear.contentShape(Rectangle()).offset(x: offset).onTapGesture { close() } }
                }
        }
        .clipped()
        .simultaneousGesture(
            DragGesture(minimumDistance: 16)
                .onChanged { drag in
                    // Mostly sideways only, so a vertical scroll never moves the row.
                    guard abs(drag.translation.width) > abs(drag.translation.height) else { return }
                    offset = min(0, max(-Self.width, restingOffset + drag.translation.width))
                }
                .onEnded { _ in
                    withAnimation(.snappy(duration: 0.2)) {
                        offset = offset < -Self.width / 2 ? -Self.width : 0
                        restingOffset = offset
                    }
                }
        )
        .accessibilityAction(named: "Delete", action)
    }

    private func close() {
        withAnimation(.snappy(duration: 0.2)) {
            offset = 0
            restingOffset = 0
        }
    }
}

extension View {
    /// A swipe-to-delete row outside a `List`; the same gesture and look as a list row's Delete.
    func swipeToDelete(perform action: @escaping () -> Void) -> some View {
        modifier(SwipeToDelete(action: action))
    }
}
