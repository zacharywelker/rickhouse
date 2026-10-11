import SwiftUI

/// The + menu's barcode lookup: scan, then land on the label's page, where your bottles of it are
/// and a bottle can be added. A code no label has falls back to the name search (the label picked
/// there remembers the code) or to starting a new label with it.
struct BarcodeLookupView: View {
    @Environment(Session.self) private var session
    /// Told when a bottle may have been added from the label page.
    var onChanged: () -> Void

    private enum Step: Hashable {
        case newLabel(code: String?, name: String)
        case label(Int)
    }

    @State private var path: [Step] = []

    var body: some View {
        NavigationStack(path: $path) {
            FindLabelView(
                title: "Look up a barcode",
                onPick: { label, code in
                    if let code, label.upc == nil, let api = session.api {
                        Task { try? await api.attachBarcode(labelId: label.id, code: code) }
                    }
                    path.append(.label(label.id))
                },
                onNewLabel: { code, name in path.append(.newLabel(code: code, name: name)) },
                scanOnAppear: true
            )
            .navigationDestination(for: Step.self) { step in
                switch step {
                case .newLabel(let code, let name):
                    NewLabelView(code: code, name: name) { label in path = [.label(label.id)] }
                case .label(let id):
                    LabelPage(id: id).onDisappear(perform: onChanged)
                }
            }
        }
    }
}
