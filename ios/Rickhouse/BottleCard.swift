import SwiftUI

/// The bottle card: the photo in a frame coloured by category (a cut-out
/// stands on a floor, any other photo fills a mat), the name, the category's
/// name beside its swatch, and one or two facts. A bottle that isn't full
/// carries a "40% left" chip.
struct BottleCard: View {
    let bottle: BottleSummary
    /// 1 in the three-column gallery, 2 in the two-column one.
    let factCount: Int

    private var color: Color { CategoryPalette.color(for: bottle.category) }
    /// Unknown counts as a cut-out, which is how every photo was drawn before the server said.
    private var isCutout: Bool { bottle.thumbIsCutout ?? true }
    /// The server's tile for a cut-out: the bottle and its floor shadow in one picture the size of the slot.
    private var tilePath: String? {
        guard let thumb = bottle.thumbPath, thumb.contains("/thumbs/") else { return nil }
        return thumb.replacingOccurrences(of: "/thumbs/", with: "/tiles/")
    }
    /// The tile didn't load (a photo the server never called a cut-out), so the thumbnail stands in.
    @State private var noTile = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // A fixed 3:4 slot with the photo drawn into it. The photo is an
            // overlay so its own shape (wide, tall, square) never reaches the
            // layout, and a cut-out and a plain photo take the same footprint.
            // Cut-out bottles are trimmed to the bottle itself, so their bottom
            // edge is the bottle's base.
            Color.clear
                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                .overlay { if isCutout { plate } else { framedPhoto } }
                .clipped()
                .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                .shadow(color: Theme.ink.opacity(0.18), radius: 0, x: 2, y: 2)

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

            if bottle.fillPct < 100 {
                Text("\(bottle.fillPct)% left")
                    .font(.inter(10, .semibold, relativeTo: .caption2))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                    .padding(.top, 4)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(([title, bottle.category] + facts + ["\(bottle.fillPct) percent full"]).joined(separator: ", "))
    }

    /// A wall in the category's colour and a darker floor. Every bottle's base
    /// sits on the same line inside the floor, so a squat flask and a tall
    /// decanter read as one set.
    private var plate: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                color
                Rectangle().fill(color.mix(with: Theme.ink, by: 0.22))
                    .frame(height: geo.size.height * 0.24)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.ink).frame(height: 1) }
                if let tilePath, !noTile {
                    AuthenticatedImage(path: tilePath, contentMode: .fill, background: .clear, onFailure: { noTile = true })
                        .frame(width: geo.size.width, height: geo.size.height)
                } else {
                    AuthenticatedImage(path: bottle.thumbPath, contentMode: .fit, background: .clear, alignment: .bottom)
                        .frame(height: geo.size.height * 0.87)
                        .padding(.horizontal, 6)
                        .padding(.bottom, geo.size.height * 0.07)
                }
            }
        }
    }

    /// A photo that kept its background: it fills a category-coloured mat, with no floor.
    private var framedPhoto: some View {
        ZStack {
            color
            AuthenticatedImage(path: bottle.thumbPath, contentMode: .fill, background: .clear)
                .padding(6)
        }
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
