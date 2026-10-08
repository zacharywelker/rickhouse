import SwiftUI

/// The rating as a big number, so it can be read while scrolling: "8.5" in the headline serif with "/ 10" under it.
/// An unrated tasting shows a dash.
struct TastingScore: View {
    let rating: String?

    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(Format.score(rating) ?? "–")
                .font(.headline(34))
                .foregroundStyle(Format.score(rating) == nil ? Theme.muted : Theme.ink)
                .monospacedDigit()
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(Format.score(rating) == nil ? "not rated" : "/ 10")
                .font(.inter(10, .medium, relativeTo: .caption2))
                .foregroundStyle(Theme.muted)
        }
        .frame(minWidth: 52, alignment: .trailing)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Format.score(rating).map { "Rated \($0) out of 10" } ?? "Not rated")
    }
}

/// A label's photo in a portrait frame on the spirit's colour, so a tall bottle fills it.
struct LabelThumb: View {
    let path: String?
    let category: String
    var width: CGFloat = 45

    var body: some View {
        AuthenticatedImage(path: path, contentMode: .fit, background: CategoryPalette.color(for: category))
            .frame(width: width, height: width * 4 / 3)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(Theme.ink, lineWidth: 1))
            .accessibilityHidden(true)
    }
}
