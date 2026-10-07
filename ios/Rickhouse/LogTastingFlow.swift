import SwiftUI

/// Log a tasting (design spec 11.4): find the label by name or barcode, say which of your bottles it was if you have
/// any of it, then fill in the tasting. A label that doesn't exist yet can be started on the spot.
struct LogTastingFlow: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    /// Called once a tasting is saved, before the sheet closes.
    var onSaved: () -> Void

    private enum Step: Hashable {
        case newLabel(code: String?, name: String)
        case bottles(LabelOption)
        case form(LabelOption, bottle: LabelBottle?)
    }

    @State private var path: [Step] = []

    var body: some View {
        NavigationStack(path: $path) {
            FindLabelView(
                title: "Log a tasting",
                onPick: { label, code in choose(label, savingCode: code) },
                onNewLabel: { code, name in path.append(.newLabel(code: code, name: name)) }
            )
            .navigationDestination(for: Step.self) { step in
                switch step {
                case .newLabel(let code, let name):
                    NewLabelView(code: code, name: name) { label in
                        // A new label has no bottles, so go straight to the tasting.
                        path = [.form(label, bottle: nil)]
                    }
                case .bottles(let label):
                    BottleChoiceView(label: label) { bottle, replacing in
                        if replacing { path.removeLast() }
                        path.append(.form(label, bottle: bottle))
                    }
                case .form(let label, let bottle):
                    TastingFormView(label: TastingLabel(label), bottle: bottle.map(TastingBottle.init)) { onSaved(); dismiss() }
                }
            }
        }
    }

    /// Goes on to the bottle choice. A barcode that found no label is saved onto the one picked, as when adding a
    /// bottle; that is best effort and never holds anything up.
    private func choose(_ label: LabelOption, savingCode code: String?) {
        if let code, label.upc == nil, let api = session.api {
            Task { try? await api.attachBarcode(labelId: label.id, code: code) }
        }
        path.append(.bottles(label))
    }
}

/// Which of your bottles of the label it was, or "Not from my collection". With no bottle of it, it moves on by itself.
struct BottleChoiceView: View {
    @Environment(Session.self) private var session
    let label: LabelOption
    /// The bottle chosen (nil for none), and whether this screen should be replaced rather than stay behind it.
    var onChoose: (LabelBottle?, Bool) -> Void

    @State private var bottles: [LabelBottle]?
    @State private var error: String?
    @State private var started = false

    var body: some View {
        Group {
            if let bottles, !bottles.isEmpty {
                List {
                    Section("Which bottle was it?") {
                        ForEach(bottles) { bottle in
                            Button { onChoose(bottle, false) } label: { row(bottle) }
                                .buttonStyle(.plain)
                        }
                    }
                    Section {
                        Button("Not from my collection") { onChoose(nil, false) }
                            .frame(minHeight: 44)
                    } footer: {
                        Text("A bar, a bottle share, a sample or a pour in a store.")
                    }
                }
                .scrollContentBackground(.hidden)
            } else if let error {
                ContentUnavailableView {
                    Label("Couldn't load your bottles", systemImage: "wifi.slash")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await load() } }
                    Button("Log it without a bottle") { onChoose(nil, true) }
                }
            } else {
                ProgressView()
            }
        }
        .background(Theme.paper)
        .navigationTitle(label.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { if !started { started = true; await load() } }
    }

    private func row(_ bottle: LabelBottle) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(bottle.title).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                Text([bottle.status.capitalized, bottle.dateAcquired.map(Format.day)].compactMap { $0 }.joined(separator: " · "))
                    .font(.inter(13)).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
            FillGauge(percent: bottle.fillPct, track: Theme.ink.opacity(0.15)).frame(width: 4, height: 32)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(bottle.title), \(bottle.status), \(bottle.fillPct) percent full")
    }

    private func load() async {
        guard let api = session.api else { return }
        do {
            let found = try await api.label(id: label.id).bottles
            error = nil
            if found.isEmpty { onChoose(nil, true) } else { bottles = found }
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
