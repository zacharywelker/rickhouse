import SwiftUI

/// The + menu's barcode lookup: the scanner first, with the search coming in behind it once the scanner has
/// slid up. Then land on the label's page, where your bottles of it are
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
    @State private var scannerUp = true
    @State private var searchReady = false
    @State private var code: String?
    @State private var typing = false

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            if searchReady { search }
            if scannerUp {
                // Its Cancel closes the whole lookup.
                ScanScreen(
                    onCode: { code = $0; searchReady = true; scannerUp = false },
                    onType: { typing = true; searchReady = true; scannerUp = false }
                )
            }
        }
        .task {
            // About the length of the full-screen slide; building the search during it would stutter the slide.
            try? await Task.sleep(for: .milliseconds(500))
            searchReady = true
        }
    }

    private var search: some View {
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
                scannedCode: code,
                startTyping: typing
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
