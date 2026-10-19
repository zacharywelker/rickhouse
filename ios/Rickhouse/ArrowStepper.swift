import SwiftUI

/// Move one thing up or down a list: two buttons, a 28 pt glyph in a 44 pt target each, disabled at the ends. The
/// caller words the VoiceOver labels ("Move Proof up"). Reusable for the priority list and the ranking screen.
struct ArrowStepper: View {
    let upLabel: String
    let downLabel: String
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onUp: () -> Void
    let onDown: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            arrow("chevron.up.circle", label: upLabel, enabled: canMoveUp, action: onUp)
            arrow("chevron.down.circle", label: downLabel, enabled: canMoveDown, action: onDown)
        }
    }

    private func arrow(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 28, weight: .light)).frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? Theme.ink : Theme.muted.opacity(0.4))
        .disabled(!enabled)
        .contentShape(Rectangle())
        .accessibilityLabel(label)
    }
}
