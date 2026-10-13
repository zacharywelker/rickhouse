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
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: cancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(draft == nil || saving || !fieldErrors.isEmpty)
                }
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
                LabelFactRows(draft: Binding($draft)!, errors: fieldErrors, onEdit: { fieldErrors[$0.rawValue] = nil }) { picking = .list($0) }
                EditRow(title: "Barcode", field: field(.barcode), placeholder: "Scan or type", keyboard: .numberPad, error: fieldErrors[LabelFact.barcode.rawValue])
                Button { scanning = true } label: {
                    Label("Scan barcode", systemImage: "barcode.viewfinder")
                        .font(.inter(15, .semibold))
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(Theme.ink)
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

    static func kind(_ list: LinkList) -> LookupKind {
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

/// The label's facts after brand, name and category: strength, age, size, MSRP and the three lists. The label editor
/// and New Label show the same rows.
struct LabelFactRows: View {
    @Binding var draft: LabelDraft
    var errors: [String: String]
    /// Off on New Label, where there is nothing to put back.
    var tracksChanges = true
    var onEdit: (LabelFact) -> Void
    var onPick: (LinkList) -> Void

    private func field(_ fact: LabelFact) -> Binding<Field> {
        Binding(get: { draft[fact] }, set: { draft[fact] = $0; onEdit(fact) })
    }

    var body: some View {
        StrengthRow(proof: field(.proof), error: errors[LabelFact.proof.rawValue], tracksChanges: tracksChanges)
        EditRow(title: "Age statement", field: field(.ageStatement), placeholder: "Add age statement", error: errors[LabelFact.ageStatement.rawValue], tracksChanges: tracksChanges)
        if tracksChanges {
            // Not offered on New Label yet: the create route does not take them (#222).
            FlagRow(title: "Cask Strength", field: field(.caskStrength))
            FlagRow(title: "Bottled In Bond", field: field(.bottledInBond))
            FlagRow(title: "NAS (no age statement)", field: field(.nas))
            if draft.isAgave { FlagRow(title: "Still proof (unaged)", field: field(.stillProof)) }
            EditRow(title: "Distilled / barrel filled", field: field(.distilled), placeholder: "YYYY-MM-DD", keyboard: .numbersAndPunctuation, error: errors[LabelFact.distilled.rawValue])
            EditRow(title: "Bottled", field: field(.bottled), placeholder: "YYYY-MM-DD", keyboard: .numbersAndPunctuation, error: errors[LabelFact.bottled.rawValue])
            EditRow(title: "Description", field: field(.description), placeholder: "What the label says", multiline: true, error: errors[LabelFact.description.rawValue])
        }
        EditRow(title: "Size (mL)", field: field(.size), keyboard: .numberPad, error: errors[LabelFact.size.rawValue], tracksChanges: tracksChanges)
        EditRow(title: "MSRP", field: field(.msrp), placeholder: "Add MSRP", keyboard: .decimalPad, prefix: "$", error: errors[LabelFact.msrp.rawValue])
        ForEach(LinkList.allCases, id: \.self) { list in
            LinkChipsRow(
                title: LabelEditor.listTitle(list), rows: draft.rows(list), changed: tracksChanges && draft.listChanged(list),
                onRemove: { draft.remove(list, id: $0.id) },
                onAdd: { onPick(list) }
            )
        }
    }
}

/// A yes/no fact: a switch, with the same dot and ↺ as any other row once it differs from what the label had.
struct FlagRow: View {
    let title: String
    @Binding var field: Field

    var body: some View {
        HStack(spacing: 6) {
            if field.changed { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
            Toggle(title, isOn: Binding(get: { field.trimmed == "true" }, set: { field.text = $0 ? "true" : "false" }))
                .foregroundStyle(Theme.muted)
                .tint(Theme.ink)
            if field.changed {
                Button { field.revert() } label: {
                    Image(systemName: "arrow.uturn.backward.circle").font(.system(size: 20)).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.ink)
                .accessibilityLabel("Put back \(title)")
            }
        }
    }
}

/// Proof and ABV side by side: type either and the other follows. Proof is what is saved (ABV × 2).
struct StrengthRow: View {
    @Binding var proof: Field
    var error: String?
    var tracksChanges = true

    private enum Side { case proof, abv }
    @FocusState private var focus: Side?
    @State private var abv = ""

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                HStack(spacing: 6) {
                    if tracksChanges && proof.changed { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
                    Text("Strength").foregroundStyle(Theme.muted).lineLimit(1).fixedSize()
                }
                Spacer(minLength: 8)
                number("Proof", text: $proof.text, side: .proof)
                Text("|").foregroundStyle(Theme.muted.opacity(0.6)).accessibilityHidden(true)
                number("ABV", text: $abv, side: .abv)
                Text("%").foregroundStyle(Theme.muted)
                if tracksChanges && proof.changed {
                    Button { proof.revert() } label: {
                        Image(systemName: "arrow.uturn.backward.circle").font(.system(size: 20)).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                    .accessibilityLabel("Put back \(proof.original.isEmpty ? "nothing" : proof.original) for proof")
                }
            }
            if tracksChanges, proof.changed, !proof.original.isEmpty {
                Text("was \(proof.original) proof").font(.inter(11, relativeTo: .caption2)).foregroundStyle(Theme.muted).strikethrough()
            }
            if let error { Text(error).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.error) }
        }
        .padding(.vertical, 2)
        .onAppear { abv = Strength.abv(fromProof: proof.text) }
        // Whichever side is being typed in drives the other.
        .onChange(of: abv) { _, typed in if focus == .abv { proof.text = Strength.proof(fromABV: typed) } }
        .onChange(of: proof.text) { _, typed in if focus != .abv { abv = Strength.abv(fromProof: typed) } }
    }

    private func number(_ title: String, text: Binding<String>, side: Side) -> some View {
        TextField(title, text: text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .fixedSize()
            .frame(minWidth: 44, alignment: .trailing)
            .focused($focus, equals: side)
            .foregroundStyle(error == nil ? Theme.ink : Theme.error)
            .overlay(alignment: .bottom) {
                if focus == side || error != nil { Rectangle().fill(error == nil ? Theme.ink : Theme.error).frame(height: 2) }
            }
            .accessibilityLabel(side == .proof ? "Proof" : "ABV percent")
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
