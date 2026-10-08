import SwiftUI

/// The playing card from the brand kit (docs/brand/pick-card-square.svg), in the asset catalog as three images: the
/// card on its ink tile (the button), and the card's front and back for the loading screen.
struct RouletteButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image("RouletteTile")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)
                Text("Roulette").font(.inter(17, .semibold, relativeTo: .headline))
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.ink)
            .padding(.vertical, 6)
            .padding(.leading, 8)
            .padding(.trailing, 14)
            .frame(maxWidth: .infinity, minHeight: 56)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.ink, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Picks any bottle at random")
    }
}

/// The loading screen: the card spinning on its vertical axis, showing its back as it turns over. It flattens as the
/// bottle takes its place. With Reduce Motion on it holds still, showing the front.
struct RouletteSpinner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// True as the pick lands, so the card flattens before the result takes over.
    var collapsing = false

    /// Seconds for one full turn.
    private let turn: TimeInterval = 0.9

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            let fraction = (timeline.date.timeIntervalSinceReferenceDate / turn).truncatingRemainder(dividingBy: 1)
            let angle = reduceMotion ? 0 : fraction * 360
            let showsFront = cos(angle * .pi / 180) >= 0
            Group {
                if showsFront {
                    Image("RouletteCardFront").resizable().scaledToFit()
                } else {
                    // Seen from behind the layer is mirrored, so the back is mirrored first to read correctly.
                    Image("RouletteCardBack").resizable().scaledToFit().scaleEffect(x: -1)
                }
            }
            .frame(width: 168)
            .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
        }
        .scaleEffect(x: collapsing ? 0.001 : 1, y: 1)
        .animation(.easeIn(duration: 0.17), value: collapsing)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Picking a bottle")
        .accessibilityAddTraits(.updatesFrequently)
    }
}
