import SwiftUI

/// Fill level is read as "about half", not 63%: the stored value stays a
/// percentage, but these six are what people set it with. Mirrors
/// src/lib/bottles/fill-state.ts on the server.
struct FillState: Identifiable, Equatable {
    let id: String
    let label: String
    let percent: Int

    static let all = [
        FillState(id: "full", label: "Full", percent: 100),
        FillState(id: "three-quarters", label: "¾", percent: 75),
        FillState(id: "half", label: "½", percent: 50),
        FillState(id: "quarter", label: "¼", percent: 25),
        FillState(id: "almost-gone", label: "Almost gone", percent: 10),
        FillState(id: "empty", label: "Empty", percent: 0),
    ]

    /// The state a stored percentage reads as. Bands meet halfway between the
    /// set-points, except that only a truly empty bottle is Empty.
    static func of(_ percent: Int) -> FillState {
        switch percent {
        case ..<1: all[5]
        case ..<18: all[4]
        case ..<38: all[3]
        case ..<63: all[2]
        case ..<88: all[1]
        default: all[0]
        }
    }

    /// "¾ full", "Almost gone", "Empty": where a bare "¾" would be ambiguous.
    var text: String { ["three-quarters", "half", "quarter"].contains(id) ? "\(label) full" : label }

    /// For VoiceOver.
    var spoken: String {
        switch id {
        case "three-quarters": "Three quarters full"
        case "half": "Half full"
        case "quarter": "A quarter full"
        default: label
        }
    }
}

/// The fill levels as a grid of buttons, the chosen one filled. The bottle page and the label page's Update fill use it.
struct FillPicker: View {
    let percent: Int
    var disabled = false
    let onPick: (Int) -> Void

    var body: some View {
        let state = FillState.of(percent)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(FillState.all) { option in
                Button { onPick(option.percent) } label: {
                    Text(option.label)
                        .font(.inter(15, .medium))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(option == state ? Theme.paper : Theme.ink)
                        .background(option == state ? Theme.ink : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(disabled)
                .accessibilityLabel(option.spoken)
                .accessibilityAddTraits(option == state ? .isSelected : [])
            }
        }
    }
}
