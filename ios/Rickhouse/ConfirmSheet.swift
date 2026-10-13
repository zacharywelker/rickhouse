import SwiftUI

/// One answer to a question sheet. A destructive answer is drawn in the error colour, any other in ink.
struct SheetAnswer {
    let title: String
    var destructive = false
    let run: () -> Void
}

/// A question as a bottom sheet in the app's own look, in place of the system dialog (which floats mid-screen
/// inside a sheet and, on iPhone, can lose its cancel button). Like the + sheet and the mute picker, it rises from
/// the bottom. One button per answer, then Cancel last (DESIGN.md 12.4).
private struct ConfirmSheet: View {
    let title: String
    let message: String?
    let answers: [SheetAnswer]
    let cancelTitle: String
    let onAnswer: (SheetAnswer) -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.headline(24)).foregroundStyle(Theme.ink)
            if let message {
                Text(message).font(.inter(14, relativeTo: .subheadline)).foregroundStyle(Theme.muted).padding(.top, 6)
            }
            ForEach(answers.indices, id: \.self) { i in
                Button { onAnswer(answers[i]) } label: {
                    Text(answers[i].title)
                        .font(.inter(17, .semibold, relativeTo: .headline))
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(Theme.paper)
                        .background(answers[i].destructive ? Theme.error : Theme.ink, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .padding(.top, i == 0 ? 20 : 10)
            }
            Button(action: onCancel) {
                Text(cancelTitle)
                    .font(.inter(17, .semibold, relativeTo: .headline))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Theme.ink)
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.top, 10)
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.paper)
        .presentationDetents([.height(height), .large])
        .presentationDragIndicator(.visible)
    }

    /// Room for the title, the message, a button per answer and Cancel; `.large` is there for the biggest text sizes.
    private var height: CGFloat { (message == nil ? 170 : 210) + CGFloat(answers.count) * 60 }
}

extension View {
    /// Asks `title` in a bottom sheet; `perform` runs after the confirm button, and the sheet closes either way.
    func confirmSheet(_ title: String, message: String? = nil, confirm: String, cancel: String = "Cancel", isPresented: Binding<Bool>, perform: @escaping () -> Void) -> some View {
        choiceSheet(title, message: message, answers: [SheetAnswer(title: confirm, destructive: true, run: perform)], cancel: cancel, isPresented: isPresented)
    }

    /// Asks `title` with one button per answer and Cancel last. `onCancel` runs only for the Cancel button; dragging
    /// the sheet away does nothing, as with tapping outside the system dialog.
    func choiceSheet(_ title: String, message: String? = nil, answers: [SheetAnswer], cancel: String = "Cancel", onCancel: @escaping () -> Void = {}, isPresented: Binding<Bool>) -> some View {
        sheet(isPresented: isPresented) {
            ConfirmSheet(
                title: title, message: message, answers: answers, cancelTitle: cancel,
                onAnswer: { $0.run(); isPresented.wrappedValue = false },
                onCancel: { onCancel(); isPresented.wrappedValue = false }
            )
        }
    }
}
