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
                row("Age", b.categoryGroup == "gin" && b.isAgedGin != true ? nil : b.categoryGroup == "gin" && b.ginIsNas == true ? "NAS" : SpiritChoices.ageText(years: b.ageYears, months: b.ageMonths, days: b.ageDays, statement: b.ageStatement))
                if b.categoryGroup == "gin" && b.categoryKind != "genever" { row("Style", b.ginStyle) }
                row("Size", "\(b.sizeMl) mL")
                row(b.categoryGroup == "rum" ? "Distilleries / Estates" : "Distilleries", b.distilleries.joined(separator: ", "))
                if b.categoryGroup == "gin" {
                    row("Botanicals", (b.botanicals ?? []).joined(separator: ", "))
                    row("Base spirits", (b.ginBases ?? []).joined(separator: ", "))
                } else if b.categoryGroup == "agave" || b.categoryGroup == "brandy" || b.categoryGroup == "rum" {
                    row(b.categoryGroup == "agave" ? "Magueys" : b.categoryGroup == "brandy" ? "Distillate" : "Base", (b.ingredients ?? []).joined(separator: ", "))
                } else { row("Mashbill", b.mashbills.joined(separator: ", ")) }
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
                row(b.categoryKind == "tequila" || b.categoryKind == "mezcal" ? "LOT #" : "Batch", b.batch)
                row("Release year", b.releaseYear.map(String.init))
                row("Barrel", b.barrelNumber)
                row("Pick", b.pickName)
                row("Paid", b.pricePaid.map(Format.money))
                row("MSRP", b.msrp.map(Format.money))
                row("Store", b.store)
                row("Acquired", b.dateAcquired.map(Format.day))
                if b.categoryKind != "tequila" && b.categoryKind != "mezcal" && b.categoryGroup != "gin" {
                    row("Distilled / barrel filled", (b.barrelFilledOn ?? b.labelBarrelFilledOn).map(Format.day))
                    row("Bottled", (b.bottledOn ?? b.labelBottledOn).map(Format.day))
                }
                row("Where it lives", b.location)
            } header: {
                SectionTitle(title: "Bottle", canEdit: !editingSomething) { startBottleEdit(b) }
            }
    }

    // MARK: Bottle edit

    /// The edit page: the form's sections (BottleForm.swift), then the Opened date, which only an existing bottle has.
    @ViewBuilder
    func bottleEditSections(_ b: BottleDetail) -> some View {
        if bottleDraft != nil {
            BottleFormSections(draft: Binding($bottleDraft)!, errors: fieldErrors)
            Section {
                DateRow(title: "Opened", field: bottleField(.opened), error: fieldErrors[BottleFact.opened.rawValue])
                FixedRow(title: "Status", value: "\(b.status.capitalized) · follows fill")
            } header: {
                SectionLabel("Use")
            } footer: {
                Text("Status follows the fill level and the Opened date. Clearing Opened on an open bottle asks whether to keep it open or mark it sealed.")
            }
            if let factError { Section { ErrorText(factError) } }
        }
    }

    func bottleField(_ fact: BottleFact) -> Binding<Field> {
        Binding(
            get: { bottleDraft?[fact] ?? Field(nil) },
            set: { bottleDraft?[fact] = $0; fieldErrors[fact.rawValue] = nil }
        )
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
