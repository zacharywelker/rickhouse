import SwiftUI

/// Naming a flight. Save with the box empty (or "Use the automatic name") clears your name.
struct RenameFlightSheet: View {
    @Environment(\.dismiss) private var dismiss
    let number: Int
    let yours: Bool
    let onSave: (String?) async -> ActionResult

    @State private var text: String
    @State private var saving = false
    @State private var problem: String?

    init(number: Int, current: String, yours: Bool, onSave: @escaping (String?) async -> ActionResult) {
        self.number = number
        self.yours = yours
        self.onSave = onSave
        _text = State(initialValue: yours ? current : "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Leave empty for the automatic name", text: $text, axis: .vertical)
                        .lineLimit(1...3)
                        .frame(minHeight: 44)
                        .onChange(of: text) { _, new in if new.count > TournamentScreenLogic.maxFlightName { text = String(new.prefix(TournamentScreenLogic.maxFlightName)) } }
                        .accessibilityLabel("Name for flight \(number)")
                    if let problem { ErrorText(problem) }
                } header: { SectionLabel("Name for flight \(number)") } footer: {
                    Text("Up to \(TournamentScreenLogic.maxFlightName) characters. Without a name the flight is called after what its bottles share.")
                }
                if yours {
                    Section {
                        Button("Use the automatic name") { save(nil) }.frame(minHeight: 44).disabled(saving)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .font(.inter(16))
            .background(Theme.paper)
            .navigationTitle("Rename flight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save(TournamentScreenLogic.flightLabel(from: text)) }.disabled(saving) }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(saving)
    }

    private func save(_ label: String?) {
        saving = true
        problem = nil
        Task {
            let result = await onSave(label)
            saving = false
            switch result {
            case .done: dismiss()
            case .failed(let message, _): problem = message
            case .busy: problem = "Another change is still saving. Try again in a moment."
            }
        }
    }
}

/// Trading places with a bottle of another flight: a searchable list of those bottles, each with its flight.
struct SwapSheet: View {
    @Environment(\.dismiss) private var dismiss
    let name: String
    let swaps: [SwapTarget]
    let onPick: (SwapTarget) async -> ActionResult

    @State private var query = ""
    @State private var saving = false
    @State private var problem: String?

    var body: some View {
        let shown = TournamentScreenLogic.filterSwaps(swaps, query: query)
        return NavigationStack {
            List {
                Section {
                    SearchField(prompt: "Find a bottle", text: $query).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    if let problem { ErrorText(problem).listRowBackground(Color.clear) }
                }
                Section {
                    ForEach(shown) { swap in
                        Button { pick(swap) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(swap.name).foregroundStyle(Theme.ink)
                                Text(swap.flight).font(.inter(13)).foregroundStyle(Theme.muted)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(saving)
                        .accessibilityLabel("\(swap.name), \(swap.flight)")
                        .accessibilityHint("Swaps it with \(name)")
                    }
                    if shown.isEmpty { Text("No bottle matches.").foregroundStyle(Theme.muted) }
                }
            }
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .font(.inter(16))
            .background(Theme.paper)
            .navigationTitle("Swap \(name) with")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) } }
        }
        .presentationDetents([.large])
    }

    private func pick(_ swap: SwapTarget) {
        saving = true
        problem = nil
        Task {
            let result = await onPick(swap)
            saving = false
            switch result {
            case .done: dismiss()
            case .failed(let message, _): problem = message
            case .busy: problem = "Another change is still saving. Try again in a moment."
            }
        }
    }
}

/// The draft's settings: saved together with Save (one regroup), not field by field.
struct DraftSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let view: TournamentView
    let renamed: Int
    let onSave: (TournamentPatch) async -> ActionResult

    @State private var draft: SettingsDraft
    @State private var saving = false
    @State private var message: String?
    @State private var errors = FormFieldErrors()

    init(view: TournamentView, renamed: Int, onSave: @escaping (TournamentPatch) async -> ActionResult) {
        self.view = view
        self.renamed = renamed
        self.onSave = onSave
        _draft = State(initialValue: SettingsDraft(view))
    }

    private var patch: TournamentPatch? { draft.patch(against: view) }
    private var canSave: Bool { patch != nil && draft.isValid && !saving }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $draft.name, axis: .vertical).lineLimit(1...3).frame(minHeight: 44)
                        .onChange(of: draft.name) { _, new in if new.count > SettingsDraft.maxName { draft.name = String(new.prefix(SettingsDraft.maxName)) } }
                        .accessibilityLabel("Name")
                    problem("name")
                } header: { SectionLabel("Name") }
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Bottles per flight")
                        Picker("Bottles per flight", selection: $draft.heatSize) { ForEach([2, 3, 4], id: \.self) { Text("\($0)").tag($0) } }.pickerStyle(.segmented)
                        problem("heatSize")
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Toggle("Blind", isOn: $draft.blind).tint(Theme.ink).frame(minHeight: 44)
                        caption("Once it starts, flights you have not tasted show only their proof.")
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Seeding")
                        Picker("Seeding", selection: $draft.seeding) { Text("Similar").tag(Seeding.similar); Text("Random").tag(Seeding.random) }.pickerStyle(.segmented)
                        caption(draft.seeding == .similar ? "Similar puts alike bottles in a flight, by the priority below." : "Random shuffles every round.")
                        problem("seeding")
                    }
                } header: { SectionLabel("Settings") } footer: {
                    Text(TournamentScreenLogic.regroupNote)
                }
                Section {
                    PriorityListView(order: $draft.groupOrder)
                    problem("groupOrder")
                } header: { SectionLabel("Grouping priority") }
                Section {
                    TextField("How you chose these bottles", text: $draft.note, axis: .vertical).lineLimit(1...3)
                        .onChange(of: draft.note) { _, new in if new.count > SettingsDraft.maxNote { draft.note = String(new.prefix(SettingsDraft.maxNote)) } }
                        .accessibilityLabel("Field note, optional")
                    problem("fieldNote")
                } header: { SectionLabel("Field note (optional)") }
                if let warning = TournamentScreenLogic.regroupWarning(draft, view: view, renamed: renamed) {
                    Section { Label(warning, systemImage: "exclamationmark.circle").font(.inter(14)).foregroundStyle(Theme.ink) }
                }
                if let message { Section { ErrorText(message) } }
            }
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .font(.inter(16))
            .background(Theme.paper)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(!canSave) }
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private func caption(_ text: String) -> some View { Text(text).font(.inter(13)).foregroundStyle(Theme.muted) }
    private func problem(_ field: String) -> some View { errors.message(for: field).map { ErrorText($0) } }

    private func save() {
        guard let patch, canSave else { return }
        saving = true
        message = nil
        errors = FormFieldErrors()
        Task {
            let result = await onSave(patch)
            saving = false
            switch result {
            case .done: dismiss()
            case .failed(let text, let fields): message = text; errors = FormFieldErrors(fields: fields)
            case .busy: message = "Another change is still saving. Try again in a moment."
            }
        }
    }
}

/// The draft's pinned bar: Start (after a question: the field locks) and Reset to automatic (no question, as the spec decided).
struct DraftBar: View {
    let canStart: Bool
    let canReset: Bool
    let busy: Bool
    let note: String?
    let onStart: () -> Void
    let onReset: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Button(action: onStart) {
                Text("Start tournament").font(.inter(17, .semibold, relativeTo: .headline)).frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Theme.paper).background(canStart && !busy ? Theme.ink : Theme.muted, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain).disabled(!canStart || busy)
            Button(action: onReset) {
                Text("Reset to automatic").font(.inter(16, .semibold, relativeTo: .body)).frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundStyle(canReset && !busy ? Theme.ink : Theme.muted)
            }
            .buttonStyle(.plain).disabled(!canReset || busy)
            .accessibilityHint("Regroups the flights by the grouping priority and clears names you gave them")
            if let note { Text(note).font(.inter(13)).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading) }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(Theme.paper)
        .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.25)).frame(height: 1) }
    }
}
