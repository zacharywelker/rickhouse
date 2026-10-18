import SwiftUI

/// The five things flights are matched on, highest priority first, reordered with arrows (`TournamentPriority.moveKey`).
/// Plain rows, not a List, so it sits inside a form section or a screen of its own.
struct PriorityListView: View {
    @Binding var order: [String]
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(order.enumerated()), id: \.element) { index, key in
                if index > 0 { Divider() }
                row(index: index, key: key)
            }
        }
    }

    private func row(index: Int, key: String) -> some View {
        let name = TournamentPriority.labels[key] ?? key
        let stepper = ArrowStepper(upLabel: "Move \(name) up", downLabel: "Move \(name) down",
                                   canMoveUp: index > 0, canMoveDown: index < order.count - 1,
                                   onUp: { order = TournamentPriority.moveKey(order, index, -1) },
                                   onDown: { order = TournamentPriority.moveKey(order, index, 1) })
        let text = VStack(alignment: .leading, spacing: 2) {
            Text("\(index + 1). \(name)").font(.inter(16, .medium)).foregroundStyle(Theme.ink)
            Text(TournamentPriority.help[key] ?? "").font(.inter(13)).foregroundStyle(Theme.muted)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), priority \(index + 1) of \(order.count). \(TournamentPriority.help[key] ?? "")")
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            text.frame(maxWidth: .infinity, alignment: .leading)
            stepper
        }
        .padding(.vertical, 6)
        .frame(minHeight: 44)
    }
}
