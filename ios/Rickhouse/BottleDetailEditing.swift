import SwiftUI

/// Editing the facts on the bottle page, one section at a time (docs/superpowers/specs/2026-10-08-edit-facts-design.md).
/// The Label section opens the label editor (LabelEditor.swift) on the label (shared by all your bottles of it) and the Bottle section edits this bottle:
/// two records, so two Saves and two requests, and one section edits at a time.
extension BottleDetailView {
    var editingSomething: Bool { bottleDraft != nil }

    // MARK: Sections

    func labelSection(_ b: BottleDetail) -> some View {
            Section {
                row("Category", b.category)
                row("Proof", b.proof.flatMap(Double.init).map { $0.formatted() })
                row("Strength", b.strength == "navy" ? "Navy Strength" : b.strength == "overproof" ? "Overproof" : nil)
                row("Age", b.ageStatement)
                row("Size", "\(b.sizeMl) mL")
                row("Distilleries", b.distilleries.joined(separator: ", "))
                row("Mashbill", b.mashbills.joined(separator: ", "))
                row("Finishes", b.finishes.joined(separator: ", "))
            } header: {
                SectionTitle(title: "Label", canEdit: !editingSomething && b.expressionId != nil) { stopEditing(); editingLabel = true }
            }
    }

    /// The bottle edit opens as its own page over this one, like the label's.
    var editingBottle: Binding<Bool> {
        Binding(get: { bottleDraft != nil }, set: { if !$0 { stopEditing() } })
    }

    func bottleSection(_ b: BottleDetail) -> some View {
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
                row("Distilled / barrel filled", (b.barrelFilledOn ?? b.labelBarrelFilledOn).map(Format.day))
                row("Bottled", (b.bottledOn ?? b.labelBottledOn).map(Format.day))
                row("Where it lives", b.location)
            } header: {
                SectionTitle(title: "Bottle", canEdit: !editingSomething) { startBottleEdit(b) }
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
        (.pick, "Pick name", .default), (.location, "Where it lives", .default), (.notes, "Notes", .default),
    ]

    @ViewBuilder
    func bottleEditSections(_ b: BottleDetail) -> some View {
        if let draft = bottleDraft {
            let shown: (BottleFact) -> Bool = { fact in
                !draft[fact].isEmpty || draft[fact].changed || revealed.contains(fact) || (draft.fromRelease && (fact == .batch || fact == .releaseYear) && !draft[fact].isEmpty)
            }
            let hidden = Self.optionalFacts.filter { !shown($0.0) && !(draft.fromRelease && ($0.0 == .batch || $0.0 == .releaseYear)) }

            Section {
                EditRow(title: "Paid", field: bottleField(.paid), placeholder: "Add price", keyboard: .decimalPad, prefix: session.currencySymbol, error: fieldErrors[BottleFact.paid.rawValue])
                PickerRow(
                    title: "Store", value: draft.storeName ?? "None", changed: draft[.store].changed,
                    onOpen: { picking = .store },
                    onRevert: { bottleDraft?[.store].revert(); bottleDraft?.storeName = b.store }
                )
                if let msrp = b.msrp { FixedRow(title: "MSRP", value: Format.money(msrp), reason: "A fact of the label, edited under Label") }
                DateRow(title: "Acquired", field: bottleField(.acquired), error: fieldErrors[BottleFact.acquired.rawValue])
            } header: {
                Text("Where it came from")
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

            bottleDatesSection(draft)

            Section {
                DateRow(title: "Opened", field: bottleField(.opened), error: fieldErrors[BottleFact.opened.rawValue])
                FixedRow(title: "Status", value: "\(b.status.capitalized) · follows fill")
            } header: {
                Text("Use")
            } footer: {
                Text("Status follows the fill level and the Opened date. Clearing Opened on an open bottle asks whether to keep it open or mark it sealed.")
            }

            if let factError { Section { ErrorText(factError) } }
        }
    }

    /// Distilled and bottled dates: blank means the bottle goes by its label's.
    @ViewBuilder
    func bottleDatesSection(_ draft: BottleDraft) -> some View {
            Section {
                DateRow(title: "Distilled / barrel filled", field: bottleField(.distilled), error: fieldErrors[BottleFact.distilled.rawValue])
                if draft[.distilled].isEmpty, let label = draft.labelDistilled { InheritedNote(date: label) }
                DateRow(title: "Bottled", field: bottleField(.bottled), error: fieldErrors[BottleFact.bottled.rawValue])
                if draft[.bottled].isEmpty, let label = draft.labelBottled { InheritedNote(date: label) }
            } header: {
                Text("Dates")
            } footer: {
                Text("Left blank, a bottle goes by its label's dates. Set one only if this bottle differs.")
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
                foot.offer(UndoOffer(message: "Bottle saved") { _ = try await api.updateBottle(id: id, undoBody) })
            } catch APIError.unauthorized {
                session.signOut()
            } catch APIError.invalid(let code, let message, let fields) {
                if code == "opened_cleared" { askOpened = true } else { show(message: message, fields: fields) }
            } catch {
                factError = error.localizedDescription
            }
        }
    }

    // MARK: Label edit (LabelEditor.swift)

    /// After the label was saved: read the bottle again and offer the undo.
    func labelSaved(_ offer: UndoOffer) {
        Task {
            await load()
            onChanged()
            foot.offer(offer)
        }
    }

    /// The label is gone and its bottles are on the other: read the bottle again, say what happened.
    func labelMerged(_ answer: MergeAnswer, into theirs: LabelDetail) {
        foot.dropUndo()
        Task {
            await load()
            onChanged()
            foot.show(FootBar.merged(answer, into: theirs))
        }
    }

    // MARK: Pickers

    /// The list a picker opens on, and what it does with the answer.
    @ViewBuilder
    func pickerSheet(for target: PickTarget) -> some View {
        switch target {
        case .brand, .list:
            EmptyView()
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
        }
    }

    // MARK: Leaving, errors, undo

    func cancelEditing() {
        if bottleDraft?.isDirty ?? false { discarding = true } else { stopEditing() }
    }

    func stopEditing() {
        picking = nil
        bottleDraft = nil
        revealed = []
        lastRevealed = nil
        fieldErrors = [:]
        factError = nil
    }

    /// The server's refusal, under the fact it names; a message with no field goes at the foot of the section.
    private func show(message: String, fields: [String: String]) {
        if fields.isEmpty { factError = message } else { fieldErrors = fields }
    }

    func runUndo(_ offer: UndoOffer) {
        foot.dropUndo()
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

/// Under a blank date on a bottle: the label's date it is going by.
struct InheritedNote: View {
    let date: String

    var body: some View {
        Text("The label's is \(Format.day(date)).")
            .font(.inter(12, relativeTo: .caption))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}
