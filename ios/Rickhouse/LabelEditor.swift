import SwiftUI

/// Editing a label's facts (docs/superpowers/specs/2026-10-08-edit-facts-design.md), from the bottle page or the label
/// page (#210). It takes a label id, so a label can be fixed whether or not you have a bottle of it. A save hands its
/// undo to the page that opened it; a merge says which label survived.
struct LabelEditor: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    let id: Int
    var onSaved: (UndoOffer) -> Void
    var onMerged: (MergeAnswer, LabelDetail) -> Void

    @State private var label: LabelDetail?
    @State private var draft: LabelDraft?
    @State private var categories: [CategoryOption] = []
    @State private var saving = false
    @State private var factError: String?
    @State private var fieldErrors: [String: String] = [:]
    @State private var picking: PickTarget?
    @State private var nameClash: LabelRef?
    @State private var merging: MergeSetup?
    @State private var discarding = false
    @State private var scanning = false
    /// Strength typed as ABV instead of proof. Proof is still what is saved (ABV × 2).
    @State private var asABV = false
    @State private var abvText = ""

    var body: some View {
        NavigationStack {
            Group {
                if let draft, let label {
                    form(draft, label)
                } else if let factError {
                    ContentUnavailableView("Couldn't load this label", systemImage: "exclamationmark.triangle", description: Text(factError))
                } else {
                    ProgressView()
                }
            }
            .background(Theme.paper)
            .navigationTitle("Edit label")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if draft == nil { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            }
        }
        .interactiveDismissDisabled(draft?.isDirty ?? false)
        .task { await load() }
        .confirmationDialog("Discard your changes?", isPresented: $discarding, titleVisibility: .visible) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("Nothing you changed has been saved.")
        }
        .sheet(item: $picking) { pickerSheet(for: $0) }
        .fullScreenCover(isPresented: $scanning) {
            ScanScreen { code in
                field(.barcode).wrappedValue.text = Barcode.normalise(code) ?? code
                scanning = false
            } onType: {
                scanning = false
            }
        }
        .sheet(item: $merging) { setup in
            MergeReview(plan: MergePlan(mine: setup.mine, theirs: setup.theirs)) { answer in
                merging = nil
                onMerged(answer, setup.theirs)
                dismiss()
            }
        }
    }

    // MARK: Form

    private func field(_ fact: LabelFact) -> Binding<Field> {
        Binding(
            get: { draft?[fact] ?? Field(nil) },
            set: {
                draft?[fact] = $0
                fieldErrors[fact.rawValue] = nil
                if fact == .name { nameClash = nil }
            }
        )
    }

    /// ABV typed here is kept as typed (so "50." survives) and saved as proof.
    private var abvField: Binding<Field> {
        Binding(
            get: { Field(original: Strength.abv(fromProof: draft?[.proof].original ?? ""), text: abvText) },
            set: {
                abvText = $0.text
                draft?[.proof].text = Strength.proof(fromABV: $0.text)
                fieldErrors[LabelFact.proof.rawValue] = nil
            }
        )
    }

    private var categoryChoice: Binding<Int> {
        Binding(
            get: { Int(draft?[.category].text ?? "") ?? 0 },
            set: { id in
                draft?[.category].text = String(id)
                if let option = categories.first(where: { $0.id == id }) { draft?.categoryName = option.name }
                fieldErrors[LabelFact.category.rawValue] = nil
            }
        )
    }

    private func form(_ draft: LabelDraft, _ label: LabelDetail) -> some View {
        List {
            Section {
                sharedNotice(bottles: label.bottles.count)
                PickerRow(
                    title: "Brand", value: draft.brandName, changed: draft[.brand].changed,
                    onOpen: { picking = .brand },
                    onRevert: { self.draft?[.brand].revert(); self.draft?.brandName = label.brand }
                )
                EditRow(title: "Name", field: field(.name), error: fieldErrors[LabelFact.name.rawValue])
                if let clash = nameClash, fieldErrors[LabelFact.name.rawValue] != nil {
                    Button { Task { await startMerge(clash) } } label: {
                        HStack {
                            Text("Merge into that label").font(.inter(15, .semibold))
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                            Spacer()
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .foregroundStyle(Theme.ink)
                    .accessibilityHint("Moves this label's bottles and tastings to \(clash.title) and removes this label")
                }
                Picker(selection: categoryChoice) {
                    ForEach(categories) { option in Text(option.parent.map { "\($0) · \(option.name)" } ?? option.name).tag(option.id) }
                } label: {
                    Text("Category").foregroundStyle(Theme.muted)
                }
                .tint(Theme.ink)
                Picker("Strength as", selection: $asABV) {
                    Text("Proof").tag(false)
                    Text("ABV %").tag(true)
                }
                .pickerStyle(.segmented)
                .onChange(of: asABV) { _, on in if on { abvText = Strength.abv(fromProof: draft[.proof].text) } }
                if asABV {
                    EditRow(title: "ABV %", field: abvField, placeholder: "Add ABV", keyboard: .decimalPad, error: fieldErrors[LabelFact.proof.rawValue])
                } else {
                    EditRow(title: "Proof", field: field(.proof), placeholder: "Add proof", keyboard: .decimalPad, error: fieldErrors[LabelFact.proof.rawValue])
                }
                EditRow(title: "Age statement", field: field(.ageStatement), placeholder: "Add age statement", error: fieldErrors[LabelFact.ageStatement.rawValue])
                EditRow(title: "Size (mL)", field: field(.size), keyboard: .numberPad, error: fieldErrors[LabelFact.size.rawValue])
                EditRow(title: "MSRP", field: field(.msrp), placeholder: "Add MSRP", keyboard: .decimalPad, prefix: "$", error: fieldErrors[LabelFact.msrp.rawValue])
                ForEach(LinkList.allCases, id: \.self) { list in
                    LinkChipsRow(
                        title: Self.listTitle(list), rows: draft.rows(list), changed: draft.listChanged(list),
                        onRemove: { self.draft?.remove(list, id: $0.id) },
                        onAdd: { picking = .list(list) }
                    )
                }
                EditRow(title: "Barcode", field: field(.barcode), placeholder: "Scan or type", keyboard: .numberPad, error: fieldErrors[LabelFact.barcode.rawValue])
                Button { scanning = true } label: {
                    Label("Scan barcode", systemImage: "barcode.viewfinder")
                        .font(.inter(15, .semibold))
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(Theme.ink)
            } header: {
                EditHeader(saving: saving, canSave: fieldErrors.isEmpty, onCancel: cancel, onSave: save)
            }
            if let factError { Section { ErrorText(factError) } }
        }
        .scrollContentBackground(.hidden)
    }

    /// Who else sees the change. With no bottle on the label there is nothing to count, so it says so.
    @ViewBuilder
    private func sharedNotice(bottles: Int) -> some View {
        if bottles != 1 {
            VStack(alignment: .leading, spacing: 2) {
                if bottles == 0 {
                    Text("No bottles of this label yet").font(.inter(14, .semibold))
                    Text("Changes show on your tastings of it.").font(.inter(13))
                } else {
                    Text("This label is shared").font(.inter(14, .semibold))
                    Text("\(bottles) of your bottles use these facts. Changes show on all of them.").font(.inter(13))
                }
            }
            .foregroundStyle(Theme.paper)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6)
            .listRowBackground(Theme.ink)
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: Load, save, merge

    private func load() async {
        guard let api = session.api else { return }
        do {
            async let detail = api.label(id: id)
            categories = try await api.categories()
            let fresh = try await detail
            label = fresh
            draft = LabelDraft(fresh)
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            factError = error.localizedDescription
        }
    }

    private func cancel() {
        if draft?.isDirty ?? false { discarding = true } else { dismiss() }
    }

    private func save() {
        guard let draft, let api = session.api, !saving else { return }
        let found = draft.errors()
        guard found.isEmpty else {
            fieldErrors = Dictionary(uniqueKeysWithValues: found.map { ($0.key.rawValue, $0.value) })
            return
        }
        let changes = draft.patch()
        if changes.isEmpty { dismiss(); return }

        saving = true
        factError = nil
        Task {
            defer { saving = false }
            do {
                try await api.updateLabel(id: id, changes)
                let undoBody = draft.undoPatch()
                let labelId = id
                onSaved(UndoOffer(message: "Label saved") { try await api.updateLabel(id: labelId, undoBody) })
                dismiss()
            } catch APIError.unauthorized {
                session.signOut()
            } catch APIError.nameTaken(let existing) {
                fieldErrors[LabelFact.name.rawValue] = "You already have \(existing.title)."
                nameClash = existing
            } catch APIError.invalid(_, let message, let fields) {
                if fields.isEmpty { factError = message } else { fieldErrors = fields }
            } catch {
                factError = error.localizedDescription
            }
        }
    }

    /// Reads both labels fresh, so the review shows what the server holds, then opens it.
    private func startMerge(_ existing: LabelRef) async {
        guard let api = session.api else { return }
        factError = nil
        do {
            async let mine = api.label(id: id)
            async let theirs = api.label(id: existing.id)
            merging = MergeSetup(mine: try await mine, theirs: try await theirs)
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            factError = error.localizedDescription
        }
    }

    // MARK: Pickers

    static func listTitle(_ list: LinkList) -> String {
        switch list {
        case .distilleries: "Distilleries"
        case .mashbills: "Mashbill"
        case .finishes: "Finishes"
        }
    }

    private static func kind(_ list: LinkList) -> LookupKind {
        switch list {
        case .distilleries: .distilleries
        case .mashbills: .mashbills
        case .finishes: .finishes
        }
    }

    @ViewBuilder
    private func pickerSheet(for target: PickTarget) -> some View {
        if let draft {
            switch target {
            case .brand:
                PickerSheet(
                    kind: .brands, title: "Brand", multiple: false,
                    initial: Int(draft[.brand].text).map { [LookupItem(id: $0, name: draft.brandName)] } ?? []
                ) { chosen in
                    guard let item = chosen.first else { return }
                    self.draft?[.brand].text = String(item.id)
                    self.draft?.brandName = item.name
                    fieldErrors[LabelFact.name.rawValue] = nil
                    nameClash = nil
                }
            case .list(let list):
                PickerSheet(
                    kind: Self.kind(list), title: Self.listTitle(list), multiple: true,
                    initial: draft.rows(list).map { LookupItem(id: $0.id, name: $0.name) }
                ) { chosen in self.draft?.setList(list, to: chosen) }
            case .store:
                EmptyView()
            }
        }
    }
}

/// The undo bar and the notice at the foot of a page, with the timers that take them away.
@Observable @MainActor
final class FootBar {
    private(set) var undo: UndoOffer?
    private(set) var notice: String?
    private var undoTimer: Task<Void, Never>?
    private var noticeTimer: Task<Void, Never>?

    /// Eight seconds to take a save back. The previous values are sent in a new request; nothing is kept on the server.
    func offer(_ offer: UndoOffer) {
        undoTimer?.cancel()
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
        notice = message
        AccessibilityNotification.Announcement(message).post()
        noticeTimer = Task {
            try? await Task.sleep(for: .seconds(6))
            if !Task.isCancelled { notice = nil }
        }
    }

    static func merged(_ answer: MergeAnswer, into theirs: LabelDetail) -> String {
        let moved = [answer.bottles > 0 ? (answer.bottles == 1 ? "1 bottle" : "\(answer.bottles) bottles") : nil,
                     answer.tastings > 0 ? (answer.tastings == 1 ? "1 tasting" : "\(answer.tastings) tastings") : nil]
            .compactMap { $0 }.joined(separator: " and ")
        return "Merged into \(theirs.brand) \(theirs.name)." + (moved.isEmpty ? "" : " \(moved) moved.")
    }
}

extension View {
    func footBar(_ bar: FootBar, onUndo: @escaping (UndoOffer) -> Void) -> some View {
        overlay(alignment: .bottom) {
            if let offer = bar.undo { UndoBar(offer: offer) { onUndo(offer) } }
            else if let notice = bar.notice { NoticeBar(message: notice) }
        }
        .animation(.default, value: bar.undo?.id)
        .animation(.default, value: bar.notice)
    }
}
