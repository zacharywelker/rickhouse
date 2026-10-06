import SwiftUI

/// The first step of Add a bottle: find the label by name, or scan its barcode.
///
/// A scan that matches one label goes straight on. One that matches several lists them.
/// One that matches none holds the code and falls back to the name search; the label
/// picked there gets the code saved on it. A search with no result offers a new label.
struct FindLabelView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    /// A label was chosen, with the barcode to save onto it when the scan found no label.
    var onPick: (LabelOption, String?) -> Void
    /// Nothing fits: start a label with the held barcode and whatever was typed.
    var onNewLabel: (_ code: String?, _ typed: String) -> Void

    @State private var query = ""
    @State private var results: [LabelOption] = []
    /// Labels that share a scanned barcode; shown instead of search results until the user types.
    @State private var scanMatches: [LabelOption]?
    /// A scanned code no label has, held while the user finds the label by name.
    @State private var heldCode: String?
    @State private var failure: String?
    @State private var searched = false
    @State private var attempt = 0
    @State private var scanning = false
    @State private var typingCode = false
    @State private var typedCode = ""

    private var shown: [LabelOption] { scanMatches ?? results }

    var body: some View {
        List {
            if let heldCode {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Barcode \(heldCode) isn't in the system.")
                            .font(.inter(15, .semibold, relativeTo: .subheadline))
                            .foregroundStyle(Theme.ink)
                        Text("Search for the label by name. The one you pick will remember this barcode.")
                            .font(.inter(14, relativeTo: .footnote))
                            .foregroundStyle(Theme.muted)
                        Button("Not this bottle") { self.heldCode = nil }
                            .font(.inter(14, .medium, relativeTo: .footnote))
                    }
                    .padding(.vertical, 4)
                }
            }
            if let scanMatches {
                Section {
                    Text("\(scanMatches.count) labels share this barcode. Pick the right one.")
                        .font(.inter(14, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                }
            }
            ForEach(shown) { option in
                Button { onPick(option, scanMatches == nil ? heldCode : nil) } label: { row(option) }
                    .buttonStyle(.plain)
            }
            if !query.isEmpty || heldCode != nil, !shown.isEmpty {
                Section {
                    Button("Can't find it? Add a new label") { onNewLabel(heldCode, query) }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .overlay {
            if let failure {
                ContentUnavailableView {
                    Label("Couldn't load labels", systemImage: "wifi.slash")
                } description: {
                    Text(failure)
                } actions: {
                    Button("Try again") { attempt += 1 }
                }
            } else if shown.isEmpty && searched {
                ContentUnavailableView {
                    Label("No label found", systemImage: "magnifyingglass")
                } description: {
                    Text(query.isEmpty ? "You don't have any labels yet." : "Nothing matches that search.")
                } actions: {
                    Button("Add a new label") { onNewLabel(heldCode, query) }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.ink)
                }
            }
        }
        .navigationTitle("Add a bottle")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Brand or name")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .primaryAction) {
                Button { scanning = true } label: { Image(systemName: "barcode.viewfinder") }
                    .accessibilityLabel("Scan a barcode")
            }
        }
        .onChange(of: query) { scanMatches = nil }
        .task(id: "\(query)#\(attempt)") { await search() }
        .fullScreenCover(isPresented: $scanning) {
            ScanScreen(
                onCode: { code in scanning = false; Task { await look(up: code) } },
                onType: { scanning = false; typingCode = true }
            )
        }
        .alert("Enter the barcode", isPresented: $typingCode) {
            TextField("The digits under it", text: $typedCode).keyboardType(.numberPad)
            Button("Look up") { let code = typedCode; typedCode = ""; Task { await look(up: code) } }
            Button("Cancel", role: .cancel) { typedCode = "" }
        }
    }

    private func row(_ option: LabelOption) -> some View {
        HStack(spacing: 12) {
            AuthenticatedImage(path: option.thumbPath, contentMode: .fit, background: CategoryPalette.color(for: option.category))
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            VStack(alignment: .leading, spacing: 2) {
                Text(option.title).font(.inter(16, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                Text(option.category).font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    private func search() async {
        try? await Task.sleep(for: .milliseconds(200))
        guard !Task.isCancelled, let api = session.api else { return }
        do {
            results = try await api.labels(matching: query)
            failure = nil
            searched = true
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            // A newer keystroke cancels this request; that isn't a failure.
            guard !Task.isCancelled else { return }
            results = []
            failure = error.localizedDescription
        }
    }

    /// One match goes straight on, several are listed, none holds the code for the name search.
    private func look(up code: String) async {
        guard let api = session.api else { return }
        guard let digits = Barcode.normalise(code) else {
            failure = "A barcode is 6 to 32 digits."
            return
        }
        do {
            let found = try await api.labels(withBarcode: digits)
            failure = nil
            switch found.count {
            case 0:
                heldCode = digits
                scanMatches = nil
            case 1:
                onPick(found[0], nil)
            default:
                heldCode = nil
                scanMatches = found
            }
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            failure = error.localizedDescription
        }
    }
}
