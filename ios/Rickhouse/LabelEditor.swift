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
    @State private var ginAged = false

    private var rules: LabelRules {
        LabelRules(category: categories.first { $0.id == Int(draft?[.category].text ?? "") }, ginAged: ginAged)
    }

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
                LabelFactRows(draft: Binding($draft)!, errors: fieldErrors, rules: rules, ginAged: $ginAged, onEdit: { fieldErrors[$0.rawValue] = nil }) { picking = .list($0) }
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
            let made = LabelDraft(fresh)
            ginAged = LabelRules.looksAged(made)
            draft = made
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
        guard let edited = draft, let api = session.api, !saving else { return }
        let draft = rules.prepared(edited)
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

/// The label's facts after brand, name and category, as the category's rules allow (LabelRules.swift). The label
/// editor and New Label show the same rows.
struct LabelFactRows: View {
    @Binding var draft: LabelDraft
    var errors: [String: String]
    var rules: LabelRules
    /// Gin only: "Aged" pressed.
    @Binding var ginAged: Bool
    /// Off on New Label, where there is nothing to put back.
    var tracksChanges = true
    var onEdit: (LabelFact) -> Void
    var onPick: (LinkList) -> Void

    /// An age greys the statement out; this opens it again (the web's triple-click).
    @State private var statementUnlocked = false

    private func field(_ fact: LabelFact) -> Binding<Field> {
        Binding(get: { draft[fact] }, set: { draft[fact] = $0; onEdit(fact) })
    }

    private func tick(_ fact: LabelFact) -> Binding<Bool> {
        Binding(
            get: { draft[fact].trimmed == "true" },
            set: { on in
                var next = draft
                next[fact].text = on ? "true" : "false"
                draft = AgeDefaults.apply(prev: draft, next: next, changed: fact)
                onEdit(fact)
            }
        )
    }

    private var bonded: Bool { rules.showsAmerican && draft[.isBottledInBond].trimmed == "true" }

    var body: some View {
        if rules.isGin && !ginAged {
            Button { ginAged = true } label: {
                Label("Aged gin? Add age and finishes", systemImage: "plus.circle")
                    .font(.inter(15, .semibold))
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .foregroundStyle(Theme.ink)
        }
        if rules.showsAging {
            TickGrid(items: [
                ("Cask Strength", tick(.isCaskStrength), true),
                ("Bottled in Bond", tick(.isBottledInBond), rules.showsAmerican),
                ("Straight", tick(.isStraight), rules.showsAmerican),
                ("NAS", tick(.isNas), true),
                ("Still proof", tick(.isStillProof), rules.showsStillProof && !AgeDefaults.ageFilled(draft) && draft[.ageStatement].isEmpty),
            ])
        }
        StrengthRow(proof: field(.proof), error: errors[LabelFact.proof.rawValue], tracksChanges: tracksChanges)
            .disabled(bonded)
        if let tier = Strength.tier(group: rules.group, proof: draft[.proof].trimmed) {
            Text(tier).font(.inter(12, .semibold, relativeTo: .caption)).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .trailing)
        }
        if rules.showsAging {
            EditRow(title: "Distilled / barrel filled", field: field(.distilled), placeholder: "YYYY-MM-DD", keyboard: .numbersAndPunctuation, error: errors[LabelFact.distilled.rawValue], tracksChanges: tracksChanges)
            EditRow(title: "Bottled", field: field(.bottled), placeholder: "YYYY-MM-DD", keyboard: .numbersAndPunctuation, error: errors[LabelFact.bottled.rawValue], tracksChanges: tracksChanges)
            DeriveAgeRow(draft: $draft) { onEdit(.ageYears) }
        }
        if bonded {
            Text("Bottled in Bond is 100 proof.").font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
        }
        if rules.showsAging {
            AgeRow(years: field(.ageYears), months: field(.ageMonths), days: field(.ageDays),
                   error: errors[LabelFact.ageYears.rawValue] ?? errors[LabelFact.ageMonths.rawValue] ?? errors[LabelFact.ageDays.rawValue])
            let locked = AgeDefaults.ageFilled(draft) && !statementUnlocked
            HStack {
                EditRow(title: "Age statement", field: field(.ageStatement), placeholder: "Add age statement", error: errors[LabelFact.ageStatement.rawValue], tracksChanges: tracksChanges)
                    .disabled(locked)
                    .opacity(locked ? 0.5 : 1)
                if locked {
                    Button("Edit") { statementUnlocked = true }
                        .font(.inter(15, .semibold))
                        .frame(minWidth: 44, minHeight: 44)
                        .foregroundStyle(Theme.ink)
                        .accessibilityLabel("Edit the age statement anyway")
                }
            }
        }
        SizeRow(field: field(.size), error: errors[LabelFact.size.rawValue])
        EditRow(title: "MSRP", field: field(.msrp), placeholder: "Add MSRP", keyboard: .decimalPad, prefix: "$", error: errors[LabelFact.msrp.rawValue])
        LinkChipsRow(
            title: LabelEditor.listTitle(.distilleries), rows: draft.rows(.distilleries), changed: tracksChanges && draft.listChanged(.distilleries),
            onRemove: { draft.remove(.distilleries, id: $0.id) }, onAdd: { onPick(.distilleries) }
        )
        if rules.baseReplacesMashbill {
            Picker(selection: field(.base).text) {
                Text("Not set").tag("")
                ForEach(LabelRules.rumBases, id: \.value) { Text($0.title).tag($0.value) }
            } label: {
                Text("Base").foregroundStyle(Theme.muted)
            }
            .tint(Theme.ink)
        } else {
            LinkChipsRow(
                title: LabelEditor.listTitle(.mashbills), rows: draft.rows(.mashbills), changed: tracksChanges && draft.listChanged(.mashbills),
                onRemove: { draft.remove(.mashbills, id: $0.id) }, onAdd: { onPick(.mashbills) }
            )
        }
        if rules.showsFinishes {
            LinkChipsRow(
                title: LabelEditor.listTitle(.finishes), rows: draft.rows(.finishes), changed: tracksChanges && draft.listChanged(.finishes),
                onRemove: { draft.remove(.finishes, id: $0.id) }, onAdd: { onPick(.finishes) }
            )
        }
        EditRow(title: "Description", field: field(.description), placeholder: "What the label says", multiline: true, error: errors[LabelFact.description.rawValue], tracksChanges: tracksChanges)
        VStack(alignment: .leading, spacing: 2) {
            EditRow(title: "Other names", field: field(.otherNames), placeholder: "Older names", multiline: true, error: errors[LabelFact.otherNames.rawValue], tracksChanges: tracksChanges)
            Text("One per line. Years in brackets: Hirsch (until 1985).").font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
        }
    }
}

/// The four ticks, two to a line, each a 44 pt target. A tick the category doesn't have is left out.
struct TickGrid: View {
    let items: [(String, Binding<Bool>, Bool)]

    var body: some View {
        let shown = items.filter(\.2)
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], spacing: 0) {
            ForEach(shown.indices, id: \.self) { i in
                let (title, on, _) = shown[i]
                Button { on.wrappedValue.toggle() } label: {
                    HStack(spacing: 8) {
                        Image(systemName: on.wrappedValue ? "checkmark.square.fill" : "square").font(.system(size: 20))
                        Text(title).font(.inter(15)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(on.wrappedValue ? .isSelected : [])
            }
        }
    }
}

/// Age as years, months and days on one line.
struct AgeRow: View {
    @Binding var years: Field
    @Binding var months: Field
    @Binding var days: Field
    var error: String?

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Age").foregroundStyle(Theme.muted).lineLimit(1).fixedSize()
                Spacer(minLength: 8)
                part($years.text, "Y", keyboard: .decimalPad, label: "Years")
                part($months.text, "M", keyboard: .numberPad, label: "Months")
                part($days.text, "D", keyboard: .numberPad, label: "Days")
            }
            if let error { Text(error).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.error) }
        }
        .padding(.vertical, 2)
    }

    private func part(_ text: Binding<String>, _ unit: String, keyboard: UIKeyboardType, label: String) -> some View {
        HStack(spacing: 2) {
            TextField("0", text: text)
                .keyboardType(keyboard)
                .multilineTextAlignment(.trailing)
                .fixedSize()
                .frame(minWidth: 32, minHeight: 44, alignment: .trailing)
                .foregroundStyle(error == nil ? Theme.ink : Theme.error)
                .accessibilityLabel(label)
            Text(unit).foregroundStyle(Theme.muted).accessibilityHidden(true)
        }
    }
}

/// The usual bottle sizes as a menu, and "Other size…" for any whole number of mL.
struct SizeRow: View {
    @Binding var field: Field
    var error: String?
    @State private var other = false

    private static let otherTag = -1

    var body: some View {
        let current = Int(field.trimmed)
        let preset = current.map { LabelRules.sizes.contains($0) } ?? false
        Picker(selection: Binding(
            get: { other || !preset ? Self.otherTag : current ?? 750 },
            set: { ml in
                if ml == Self.otherTag { other = true } else { other = false; field.text = String(ml) }
            }
        )) {
            ForEach(LabelRules.sizes, id: \.self) { Text(LabelRules.sizeTitle($0)).tag($0) }
            Text("Other size…").tag(Self.otherTag)
        } label: {
            Text("Size").foregroundStyle(Theme.muted)
        }
        .tint(Theme.ink)
        .onAppear { other = !preset }
        if other || !preset {
            EditRow(title: "Size (mL)", field: $field, keyboard: .numberPad, error: error, tracksChanges: false)
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

/// Under the two dates: how far apart they are, with a button that puts it in the age. Nothing moves until it is tapped,
/// since silently rewriting the age while a date is typed is how an age someone entered gets lost.
struct DeriveAgeRow: View {
    @Binding var draft: LabelDraft
    var onFilled: () -> Void

    var body: some View {
        if let age = DatedAge(filled: draft[.distilled].trimmed, bottled: draft[.bottled].trimmed) {
            let already = draft[.ageYears].trimmed == String(age.years) && draft[.ageMonths].trimmed == String(age.months) && draft[.ageDays].trimmed == String(age.days)
            HStack {
                Text("Those dates are \(age.described) apart.").font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                Spacer(minLength: 8)
                Button(already ? "Age filled in" : "Use as the age") {
                    draft[.ageYears].text = String(age.years)
                    draft[.ageMonths].text = String(age.months)
                    draft[.ageDays].text = String(age.days)
                    onFilled()
                }
                .font(.inter(15, .semibold))
                .frame(minHeight: 44)
                .foregroundStyle(Theme.ink)
                .disabled(already)
            }
        }
    }
}
