import SwiftUI

/// A yes/no question as a bottom sheet in the app's own look, in place of the system dialog (which floats mid-screen
/// inside a sheet). Like the + sheet and the mute picker, it rises from the bottom.
private struct ConfirmSheet: View {
    let title: String
    let message: String?
    let confirmTitle: String
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.headline(24)).foregroundStyle(Theme.ink)
            if let message {
                Text(message).font(.inter(14, relativeTo: .subheadline)).foregroundStyle(Theme.muted).padding(.top, 6)
            }
            Button(action: onConfirm) {
                Text(confirmTitle)
                    .font(.inter(17, .semibold, relativeTo: .headline))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Theme.paper)
                    .background(Theme.error, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(.top, 20)
            Button(action: onCancel) {
                Text("Cancel")
                    .font(.inter(17, .semibold, relativeTo: .headline))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Theme.ink)
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.ink, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.top, 10)
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.paper)
        .presentationDetents([.height(message == nil ? 230 : 270), .large])
        .presentationDragIndicator(.visible)
    }
}

extension View {
    /// Asks `title` in a bottom sheet; `perform` runs after the confirm button, and the sheet closes either way.
    func confirmSheet(_ title: String, message: String? = nil, confirm: String, isPresented: Binding<Bool>, perform: @escaping () -> Void) -> some View {
        sheet(isPresented: isPresented) {
            ConfirmSheet(title: title, message: message, confirmTitle: confirm, onConfirm: { perform(); isPresented.wrappedValue = false }, onCancel: { isPresented.wrappedValue = false })
        }
    }
}
