import SwiftUI

/// The bottle card: the photo in a frame coloured by category, the name, the
/// category's name beside its swatch, and one or two facts. A fill gauge runs
/// down the frame's right edge.
struct BottleCard: View {
    let bottle: BottleSummary
    /// 1 in the three-column gallery, 2 in the two-column one.
    let factCount: Int

    private var color: Color { CategoryPalette.color(for: bottle.category) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // A fixed 3:4 slot with the photo drawn into it. The photo is an
            // overlay so its own shape (wide, tall, square) never reaches the
            // layout. Cut-out bottles, the usual photo here, are trimmed to the
            // bottle itself, so they scale to fit and sit on a plate of the
            // category's colour; the slot clips anything that still overflows.
            Color.clear
                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                .overlay { AuthenticatedImage(path: bottle.thumbPath, contentMode: .fit, background: .clear).padding(4) }
                .clipped()
                .padding(8)
                .background(color)
                .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                .overlay(alignment: .trailing) {
                    FillGauge(percent: bottle.fillPct)
                        .frame(width: 3)
                        .padding(.vertical, 8)
                        .padding(.trailing, 2)
                }

            Text(title)
                .font(.inter(12.5, .semibold, relativeTo: .footnote))
                .foregroundStyle(Theme.ink)
                .lineLimit(2, reservesSpace: true)
                .padding(.top, 8)

            HStack(spacing: 4) {
                Rectangle().fill(color)
                    .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                    .frame(width: 8, height: 8)
                    .accessibilityHidden(true)
                Text(bottle.category)
                    .font(.inter(11, .medium, relativeTo: .caption2))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .padding(.top, 4)

            ForEach(Array(facts.enumerated()), id: \.offset) { index, fact in
                Text(fact)
                    .font(.inter(12, index == 0 ? .medium : .regular, relativeTo: .caption))
                    .monospacedDigit()
                    .foregroundStyle(index == 0 ? Theme.ink : Theme.muted)
                    .lineLimit(1)
                    .padding(.top, index == 0 ? 4 : 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(([title, bottle.category] + facts + ["\(bottle.fillPct) percent full"]).joined(separator: ", "))
    }

    private var title: String {
        bottle.name.lowercased().hasPrefix(bottle.brand.lowercased()) ? bottle.name : "\(bottle.brand) \(bottle.name)"
    }

    /// Proof, then age statement, then where it was bought. A slot is never
    /// blank, so a bottle missing one falls to the next. The spec's per-category
    /// facts (rum age, gin style, amaro region, mashbill) need data the server
    /// doesn't send yet; until then every category shares this order.
    private var facts: [String] {
        var all: [String] = []
        if let proof = bottle.proof, let value = Double(proof) { all.append("\(value.formatted()) proof") }
        if let age = bottle.ageStatement, !age.isEmpty { all.append(age) }
        if let store = bottle.store, !store.isEmpty { all.append(store) }
        if all.isEmpty { all.append(bottle.category) }
        return Array(all.prefix(factCount))
    }
}

/// A thin vertical gauge on the frame's edge, filling from the bottom.
struct FillGauge: View {
    let percent: Int
    /// Paper on a category frame; a faint ink where it sits on paper.
    var track: Color = Theme.paper.opacity(0.75)

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                Capsule().fill(track)
                Capsule().fill(Theme.ink)
                    .frame(height: geo.size.height * CGFloat(max(0, min(100, percent))) / 100)
            }
        }
        .accessibilityHidden(true)
    }
}
