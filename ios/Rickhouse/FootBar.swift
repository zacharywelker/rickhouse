import SwiftUI

/// What the foot-of-screen bar can say (DESIGN.md 12.5): an undo for a save, a notice for what cannot be put back,
/// or a failure with Retry. One bar per screen, shown by `footBar`; undo and notice fade on their own, a failure stays
/// until it is dismissed, retried or replaced by a success.
@Observable @MainActor
final class FootBar {
    struct Failure: Identifiable {
        let id = UUID()
        let message: String
        let retry: () -> Void
    }

    private(set) var undo: UndoOffer?
    private(set) var notice: String?
    private(set) var failure: Failure?
    private var undoTimer: Task<Void, Never>?
    private var noticeTimer: Task<Void, Never>?

    /// Eight seconds to take a save back. The previous values are sent in a new request; nothing is kept on the server.
    func offer(_ offer: UndoOffer) {
        undoTimer?.cancel()
        failure = nil
        undo = offer
        AccessibilityNotification.Announcement("\(offer.message). Undo is available for a few seconds.").post()
        undoTimer = Task {
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { undo = nil }
        }
    }

    func dropUndo() {
        undoTimer?.cancel()
        undo = nil
    }

    /// A few seconds of words, for what cannot be undone.
    func show(_ message: String) {
        noticeTimer?.cancel()
        failure = nil
        notice = message
        AccessibilityNotification.Announcement(message).post()
        noticeTimer = Task {
            try? await Task.sleep(for: .seconds(6))
            if !Task.isCancelled { notice = nil }
        }
    }

    /// An action the person just took failed. `retry` runs the same action again.
    func fail(_ message: String, retry: @escaping () -> Void) {
        failure = Failure(message: message, retry: retry)
        AccessibilityNotification.Announcement("\(message). Retry is available.").post()
    }

    func fail(_ error: Error, retry: @escaping () -> Void) { fail(error.localizedDescription, retry: retry) }

    func dismissFailure() { failure = nil }

    func retryFailure() {
        guard let failure else { return }
        self.failure = nil
        failure.retry()
    }

    static func merged(_ answer: MergeAnswer, into theirs: LabelDetail) -> String {
        let moved = [answer.bottles > 0 ? (answer.bottles == 1 ? "1 bottle" : "\(answer.bottles) bottles") : nil,
                     answer.tastings > 0 ? (answer.tastings == 1 ? "1 tasting" : "\(answer.tastings) tastings") : nil]
            .compactMap { $0 }.joined(separator: " and ")
        return "Merged into \(theirs.brand) \(theirs.name)." + (moved.isEmpty ? "" : " \(moved) moved.")
    }
}

/// The bar itself: a message, and optionally one button and a dismiss. Every target is at least 44 pt.
private struct FootBarView: View {
    let message: String
    var icon: String?
    var action: (title: String, hint: String?, run: () -> Void)?
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(spacing: 0) {
            if let icon { Image(systemName: icon).padding(.leading, 14).accessibilityHidden(true) }
            Text(message).font(.inter(15, .medium)).padding(.horizontal, 14).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let action {
                Button(action.title, action: action.run)
                    .font(.inter(15, .semibold))
                    .frame(minWidth: 64, minHeight: 48)
                    .overlay(alignment: .leading) { Rectangle().fill(Theme.paper.opacity(0.3)).frame(width: 1) }
                    .accessibilityHint(action.hint ?? "")
            }
            if let onDismiss {
                Button(action: onDismiss) { Image(systemName: "xmark").frame(width: 44, height: 48) }
                    .accessibilityLabel("Dismiss")
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.paper)
        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .shadow(color: .black.opacity(0.18), radius: 0, x: 0, y: 2)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .accessibilityElement(children: .contain)
    }
}

extension View {
    /// Shows the screen's `FootBar` under the content, so it never covers a button. A failure wins over an undo, an
    /// undo over a notice.
    func footBar(_ bar: FootBar, onUndo: @escaping (UndoOffer) -> Void = { _ in }) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            if let failure = bar.failure {
                FootBarView(message: failure.message, icon: "exclamationmark.triangle.fill",
                            action: ("Retry", "Tries again", { bar.retryFailure() }), onDismiss: { bar.dismissFailure() })
            } else if let offer = bar.undo {
                FootBarView(message: offer.message, action: ("Undo", "Puts back what was there before", { onUndo(offer) }))
            } else if let notice = bar.notice {
                FootBarView(message: notice).accessibilityAddTraits(.updatesFrequently)
            }
        }
        .animation(.default, value: bar.failure?.id)
        .animation(.default, value: bar.undo?.id)
        .animation(.default, value: bar.notice)
    }
}
