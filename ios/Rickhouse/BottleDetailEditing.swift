import SwiftUI

/// Editing the facts on the bottle page, one section at a time (docs/superpowers/specs/2026-10-08-edit-facts-design.md).
/// The Label section edits the label (shared by all your bottles of it) and the Bottle section edits this bottle:
/// two records, so two Saves and two requests, and one section edits at a time.
extension BottleDetailView {
    var editingSomething: Bool { bottleDraft != nil || labelDraft != nil }

    // MARK: Sections

    @ViewBuilder
    func labelSection(_ b: BottleDetail) -> some View {
        if labelDraft != nil {
            labelEditSection(b)
        } else {
            Section {
                row("Category", b.category)
                row("Proof", b.proof.flatMap(Double.init).map { $0.formatted() })
                row("Age", b.ageStatement)
                row("Size", "\(b.sizeMl) mL")
                row("Distilleries", b.distilleries.joined(separator: ", "))
                row("Mashbill", b.mashbills.joined(separator: ", "))
                row("Finishes", b.finishes.joined(separator: ", "))
            } header: {
                SectionTitle(title: "Label", canEdit: !editingSomething && b.expressionId != nil) { Task { await startLabelEdit(b) } }
            }
        }
    }

    @ViewBuilder
    func bottleSection(_ b: BottleDetail) -> some View {
        if bottleDraft != nil {
            bottleEditSections(b)
        } else {
            Section {
                row("Status", b.status.capitalized)
                row("Opened", b.dateOpened.map(Format.day))
                row("Batch", b.batch)
                row("Release year", b.releaseYear.map(String.init))
                row("Barrel", b.barrelNumber)
                row("Pick", b.pickName)
                row("Paid", b.pricePaid.map(Format.money))
                row("MSRP", b.msrp.map(Format.money))
                row("Store", b.store)
                row("Acquired", b.dateAcquired.map(Format.day))
                row("Location", b.location)
            } header: {
                SectionTitle(title: "Bottle", canEdit: !editingSomething) { startBottleEdit(b) }
            }
        }
    }

    // MARK: Bottle edit

    func bottleField(_ fact: BottleFact) -> Binding<Field> {
        Binding(
            get: { bottleDraft?[fact] ?? Field(nil) },
            set: { bottleDraft?[fact] = $0; fieldErrors[fact.rawValue] = nil }
        )
    }

    private static let optionalFacts: [(BottleFact, String, UIKeyboardType)] = [
        (.batch, "Batch", .default), (.releaseYear, "Release year", .numberPad), (.barrel, "Barrel", .default),
        (.pick, "Pick name", .default), (.location, "Location", .default), (.notes, "Notes", .default),
    ]

    @ViewBuilder
    func bottleEditSections(_ b: BottleDetail) -> some View {
        if let draft = bottleDraft {
            let shown: (BottleFact) -> Bool = { fact in
                !draft[fact].isEmpty || draft[fact].changed || revealed.contains(fact) || (draft.fromRelease && (fact == .batch || fact == .releaseYear) && !draft[fact].isEmpty)
            }
            let hidden = Self.optionalFacts.filter { !shown($0.0) && !(draft.fromRelease && ($0.0 == .batch || $0.0 == .releaseYear)) }

            Section {
                EditRow(title: "Paid", field: bottleField(.paid), placeholder: "Add price", keyboard: .decimalPad, prefix: "$", error: fieldErrors[BottleFact.paid.rawValue])
                PickerRow(
                    title: "Store", value: draft.storeName ?? "None", changed: draft[.store].changed,
                    onOpen: { picking = .store },
                    onRevert: { bottleDraft?[.store].revert(); bottleDraft?.storeName = b.store }
                )
                if let msrp = b.msrp { FixedRow(title: "MSRP", value: Format.money(msrp), reason: "A fact of the label, edited under Label") }
                DateEditRow(title: "Acquired", field: bottleField(.acquired), error: fieldErrors[BottleFact.acquired.rawValue])
            } header: {
                VStack(alignment: .leading, spacing: 4) {
                    EditHeader(saving: savingFacts, canSave: fieldErrors.isEmpty, onCancel: cancelEditing, onSave: { saveBottle(choice: nil) })
                    Text("Where it came from")
                }
            }

            Section {
                ForEach(Self.optionalFacts, id: \.0) { fact, title, keyboard in
                    if draft.fromRelease && (fact == .batch || fact == .releaseYear) {
                        if !draft[fact].isEmpty { FixedRow(title: title, value: draft[fact].original, reason: "From its release") }
                    } else if shown(fact) {
                        EditRow(
                            title: title, field: bottleField(fact), placeholder: "Add \(title.lowercased())", keyboard: keyboard,
                            multiline: fact == .notes, error: fieldErrors[fact.rawValue], focusOnAppear: lastRevealed == fact
                        )
                    }
                }
                if !hidden.isEmpty {
                    AddDetailChips(titles: hidden.map(\.1)) { index in
                        let fact = hidden[index].0
                        revealed.insert(fact)
                        lastRevealed = fact
                    }
                }
            } header: {
                Text("This bottle")
            }

            Section {
                DateEditRow(title: "Opened", field: bottleField(.opened), error: fieldErrors[BottleFact.opened.rawValue])
                FixedRow(title: "Status", value: "\(b.status.capitalized) · follows fill")
            } header: {
                Text("Use")
            } footer: {
                Text("Status follows the fill level and the Opened date. Clearing Opened on an open bottle asks whether to keep it open or mark it sealed.")
            }

            if let factError { Section { ErrorText(factError) } }
        }
    }

    func startBottleEdit(_ b: BottleDetail) {
        stopEditing()
        bottleDraft = BottleDraft(b)
    }

    /// Saves the bottle's changes. An open bottle whose Opened date was cleared has to say what to do with it first.
    func saveBottle(choice: OpenedChoice?) {
        guard let draft = bottleDraft, let api = session.api, !savingFacts else { return }
        let found = draft.errors(today: Format.isoDay(Date()))
        guard found.isEmpty else {
            fieldErrors = Dictionary(uniqueKeysWithValues: found.map { ($0.key.rawValue, $0.value) })
            return
        }
        let changes = draft.patch(choice: choice)
        if changes.isEmpty { stopEditing(); return }
        if draft.clearsOpened && choice == nil { askOpened = true; return }

        savingFacts = true
        factError = nil
        Task {
            defer { savingFacts = false }
            do {
                _ = try await api.updateBottle(id: id, changes)
                let undoBody = draft.undoPatch(choice: choice)
                await load()
                stopEditing()
                onChanged()
                offerUndo("Bottle saved") { _ = try await api.updateBottle(id: id, undoBody) }
            } catch APIError.unauthorized {
                session.signOut()
            } catch APIError.invalid(let code, let message, let fields) {
                if code == "opened_cleared" { askOpened = true } else { show(message: message, fields: fields) }
            } catch {
                factError = error.localizedDescription
            }
        }
    }

    // MARK: Label edit

    func labelField(_ fact: LabelFact) -> Binding<Field> {
        Binding(
            get: { labelDraft?[fact] ?? Field(nil) },
            set: {
                labelDraft?[fact] = $0
                fieldErrors[fact.rawValue] = nil
                if fact == .name { nameClash = nil }
            }
        )
    }

    private var categoryChoice: Binding<Int> {
        Binding(
            get: { Int(labelDraft?[.category].text ?? "") ?? 0 },
            set: { id in
                labelDraft?[.category].text = String(id)
                if let option = categories.first(where: { $0.id == id }) { labelDraft?.categoryName = option.name }
                fieldErrors[LabelFact.category.rawValue] = nil
            }
        )
    }

    @ViewBuilder
    func labelEditSection(_ b: BottleDetail) -> some View {
        if let draft = labelDraft {
            Section {
                if labelBottleCount > 1 {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("This label is shared").font(.inter(14, .semibold))
                        Text("\(labelBottleCount) of your bottles use these facts. Changes show on all of them.").font(.inter(13))
                    }
                    .foregroundStyle(Theme.paper)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
                    .listRowBackground(Theme.ink)
                    .accessibilityElement(children: .combine)
                }
                PickerRow(
                    title: "Brand", value: draft.brandName, changed: draft[.brand].changed,
                    onOpen: { picking = .brand },
                    onRevert: { labelDraft?[.brand].revert(); labelDraft?.brandName = b.brand }
                )
                EditRow(title: "Name", field: labelField(.name), error: fieldErrors[LabelFact.name.rawValue])
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
                EditRow(title: "Proof", field: labelField(.proof), placeholder: "Add proof", keyboard: .decimalPad, error: fieldErrors[LabelFact.proof.rawValue])
                EditRow(title: "Age statement", field: labelField(.ageStatement), placeholder: "Add age statement", error: fieldErrors[LabelFact.ageStatement.rawValue])
                EditRow(title: "Size (mL)", field: labelField(.size), keyboard: .numberPad, error: fieldErrors[LabelFact.size.rawValue])
                EditRow(title: "MSRP", field: labelField(.msrp), placeholder: "Add MSRP", keyboard: .decimalPad, prefix: "$", error: fieldErrors[LabelFact.msrp.rawValue])
                ForEach(LinkList.allCases, id: \.self) { list in
                    LinkChipsRow(
                        title: Self.listTitle(list), rows: draft.rows(list), changed: draft.listChanged(list),
                        onRemove: { labelDraft?.remove(list, id: $0.id) },
                        onAdd: { picking = .list(list) }
                    )
                }
                EditRow(title: "Barcode", field: labelField(.barcode), placeholder: "Scan or type", keyboard: .numberPad, error: fieldErrors[LabelFact.barcode.rawValue])
            } header: {
                VStack(alignment: .leading, spacing: 4) {
                    EditHeader(saving: savingFacts, canSave: fieldErrors.isEmpty, onCancel: cancelEditing, onSave: saveLabel)
                    Text("Label")
                }
            }
            if let factError { Section { ErrorText(factError) } }
        }
    }

    func startLabelEdit(_ b: BottleDetail) async {
        guard let api = session.api, let expressionId = b.expressionId else { return }
        stopEditing()
        do {
            async let detail = api.label(id: expressionId)
            if categories.isEmpty { categories = try await api.categories() }
            let label = try await detail
            labelId = expressionId
            labelBottleCount = label.bottles.count
            labelDraft = LabelDraft(label)
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            factError = error.localizedDescription
        }
    }

    func saveLabel() {
        guard let draft = labelDraft, let labelId, let api = session.api, !savingFacts else { return }
        let found = draft.errors()
        guard found.isEmpty else {
            fieldErrors = Dictionary(uniqueKeysWithValues: found.map { ($0.key.rawValue, $0.value) })
            return
        }
        let changes = draft.patch()
        if changes.isEmpty { stopEditing(); return }

        savingFacts = true
        factError = nil
        Task {
            defer { savingFacts = false }
            do {
                try await api.updateLabel(id: labelId, changes)
                let undoBody = draft.undoPatch()
                await load()
                stopEditing()
                onChanged()
                offerUndo("Label saved") { try await api.updateLabel(id: labelId, undoBody) }
            } catch APIError.unauthorized {
                session.signOut()
            } catch APIError.nameTaken(let existing) {
                fieldErrors[LabelFact.name.rawValue] = "You already have \(existing.title)."
                nameClash = existing
            } catch APIError.invalid(_, let message, let fields) {
                show(message: message, fields: fields)
            } catch {
                factError = error.localizedDescription
            }
        }
    }

    // MARK: Merge

    /// Reads both labels fresh, so the review shows what the server holds, then opens it.
    func startMerge(_ existing: LabelRef) async {
        guard let api = session.api, let labelId else { return }
        factError = nil
        do {
            async let mine = api.label(id: labelId)
            async let theirs = api.label(id: existing.id)
            merging = MergeSetup(mine: try await mine, theirs: try await theirs)
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            factError = error.localizedDescription
        }
    }

    /// The label is gone and its bottles are on the other: leave edit mode, read the bottle again, say what happened.
    func finishMerge(_ answer: MergeAnswer, into theirs: LabelDetail) {
        merging = nil
        stopEditing()
        undoTimer?.cancel()
        undoOffer = nil
        Task {
            await load()
            onChanged()
            let moved = [answer.bottles > 0 ? (answer.bottles == 1 ? "1 bottle" : "\(answer.bottles) bottles") : nil,
                         answer.tastings > 0 ? (answer.tastings == 1 ? "1 tasting" : "\(answer.tastings) tastings") : nil]
                .compactMap { $0 }.joined(separator: " and ")
            showNotice("Merged into \(theirs.brand) \(theirs.name)." + (moved.isEmpty ? "" : " \(moved) moved."))
        }
    }

    /// A few seconds of words at the foot of the page, for what cannot be undone.
    func showNotice(_ message: String) {
        noticeTimer?.cancel()
        notice = message
        AccessibilityNotification.Announcement(message).post()
        noticeTimer = Task {
            try? await Task.sleep(for: .seconds(6))
            if !Task.isCancelled { notice = nil }
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

    /// The list a picker opens on, and what it does with the answer.
    @ViewBuilder
    func pickerSheet(for target: PickTarget) -> some View {
        switch target {
        case .brand:
            if let draft = labelDraft {
                PickerSheet(
                    kind: .brands, title: "Brand", multiple: false,
                    initial: Int(draft[.brand].text).map { [LookupItem(id: $0, name: draft.brandName)] } ?? []
                ) { chosen in
                    guard let item = chosen.first else { return }
                    labelDraft?[.brand].text = String(item.id)
                    labelDraft?.brandName = item.name
                    fieldErrors[LabelFact.name.rawValue] = nil
                    nameClash = nil
                }
            }
        case .store:
            if let draft = bottleDraft {
                PickerSheet(
                    kind: .stores, title: "Store", multiple: false,
                    initial: Int(draft[.store].text).map { [LookupItem(id: $0, name: draft.storeName ?? "")] } ?? [],
                    allowNone: true
                ) { chosen in
                    bottleDraft?[.store].text = chosen.first.map { String($0.id) } ?? ""
                    bottleDraft?.storeName = chosen.first?.name
                }
            }
        case .list(let list):
            if let draft = labelDraft {
                PickerSheet(
                    kind: Self.kind(list), title: Self.listTitle(list), multiple: true,
                    initial: draft.rows(list).map { LookupItem(id: $0.id, name: $0.name) }
                ) { chosen in labelDraft?.setList(list, to: chosen) }
            }
        }
    }

    // MARK: Leaving, errors, undo

    func cancelEditing() {
        if (bottleDraft?.isDirty ?? false) || (labelDraft?.isDirty ?? false) { discarding = true } else { stopEditing() }
    }

    func stopEditing() {
        picking = nil
        nameClash = nil
        bottleDraft = nil
        labelDraft = nil
        labelId = nil
        revealed = []
        lastRevealed = nil
        fieldErrors = [:]
        factError = nil
    }

    /// The server's refusal, under the fact it names; a message with no field goes at the foot of the section.
    private func show(message: String, fields: [String: String]) {
        if fields.isEmpty { factError = message } else { fieldErrors = fields }
    }

    /// Eight seconds to take a save back. The previous values are sent in a new request; nothing is kept on the server.
    func offerUndo(_ message: String, run: @escaping () async throws -> Void) {
        undoTimer?.cancel()
        undoOffer = UndoOffer(message: message, run: run)
        AccessibilityNotification.Announcement("\(message). Undo is available for a few seconds.").post()
        undoTimer = Task {
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { undoOffer = nil }
        }
    }

    func runUndo(_ offer: UndoOffer) {
        undoTimer?.cancel()
        undoOffer = nil
        Task {
            do {
                try await offer.run()
                await load()
                onChanged()
                AccessibilityNotification.Announcement("Put back.").post()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                factError = "Couldn't put it back: \(error.localizedDescription)"
            }
        }
    }
}
