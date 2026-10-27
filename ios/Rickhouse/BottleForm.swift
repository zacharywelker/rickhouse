import SwiftUI

/// A bottle's facts in the web form's sections: This bottle, Release, Single-barrel detail, and This bottle's own proof,
/// age and size. Adding and editing show the same sections; adding keeps the last three behind "More details" so the
/// quick way in stays quick. The caller owns the draft and the rest of the screen (photos, the Use section, Save).
struct BottleFormSections: View {
    @Environment(Session.self) private var session
    @Binding var draft: BottleDraft
    var errors: [String: String]
    /// Said under the label when switching it dropped a release; the caller clears it when the form is saved.
    @State private var showMore: Bool
    @State private var pickingStore = false
    @State private var switchingLabel = false
    @State private var switchError: String?
    @State private var droppedRelease: String?
    @State private var ageUnlocked = false

    init(draft: Binding<BottleDraft>, errors: [String: String]) {
        _draft = draft
        self.errors = errors
        _showMore = State(initialValue: !draft.wrappedValue.isNew)
    }

    private var tracks: Bool { !draft.isNew }

    private func field(_ fact: BottleFact) -> Binding<Field> {
        Binding(get: { draft[fact] }, set: { draft[fact] = $0 })
    }

    private func error(_ fact: BottleFact) -> String? { errors[fact.rawValue] }

    private func tick(_ fact: BottleFact) -> Binding<Bool> {
        Binding(get: { draft[fact].trimmed == "true" }, set: { draft[fact].text = $0 ? "true" : "false" })
    }

    var body: some View {
        Section {
            PickerRow(
                title: "Label", value: draft.labelTitle, changed: tracks && draft[.label].changed,
                onOpen: { switchingLabel = true },
                onRevert: { Task { await revertLabel() } }
            )
            .sheet(isPresented: $switchingLabel) {
                LabelSwitchSheet { chosen in Task { await switchLabel(to: chosen) } }
            }
            if let droppedRelease {
                Text("Moved to another label, so “\(droppedRelease)” is no longer its release.")
                    .font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
            }
            if let switchError { ErrorText(switchError) }
            EditRow(title: "Price paid", field: field(.paid), placeholder: "0.00", keyboard: .decimalPad, prefix: session.currencySymbol, error: error(.paid), tracksChanges: tracks)
            PickerRow(
                title: "Store", value: draft.storeName ?? "None", changed: tracks && draft[.store].changed,
                onOpen: { pickingStore = true },
                onRevert: { draft[.store].revert() }
            )
            .sheet(isPresented: $pickingStore) {
                PickerSheet(
                    kind: .stores, title: "Store", multiple: false,
                    initial: Int(draft[.store].text).map { [LookupItem(id: $0, name: draft.storeName ?? "")] } ?? [],
                    allowNone: true
                ) { chosen in
                    draft[.store].text = chosen.first.map { String($0.id) } ?? ""
                    draft.storeName = chosen.first?.name
                }
            }
            DateRow(title: "Date acquired", field: field(.acquired), error: error(.acquired), tracksChanges: tracks)
            Picker(selection: field(.acquisition).text) {
                ForEach(BottleFact.acquisitions, id: \.value) { Text($0.title).tag($0.value) }
            } label: {
                Text("How you got it").foregroundStyle(Theme.muted)
            }
            .tint(Theme.ink)
            EditRow(title: "Where it lives", field: field(.location), placeholder: "Bar cart, basement shelf 3", error: error(.location), tracksChanges: tracks)
        } header: {
            SectionLabel("This bottle")
        }

        if !showMore {
            Section {
                Button { showMore = true } label: {
                    HStack {
                        Text("More details").font(.inter(16, .medium))
                        Spacer()
                        Text("Release, single barrel, own proof and age").font(.inter(12)).foregroundStyle(Theme.muted)
                        Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold))
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .foregroundStyle(Theme.ink)
            }
        } else {
            releaseSection
            if draft.showsBarrelDetail { barrelSection }
            ownSection
            Section {
                EditRow(title: "Notes", field: field(.notes), placeholder: "Add notes", multiline: true, error: error(.notes), tracksChanges: tracks)
            } header: {
                SectionLabel("Notes")
            }
        }
    }

    // MARK: Release

    private var releaseSection: some View {
        Section {
            if !draft.releases.isEmpty {
                Picker(selection: field(.release).text) {
                    Text("Not listed").tag("")
                    ForEach(draft.releases) { Text($0.title).tag(String($0.id)) }
                } label: {
                    Text("Release").foregroundStyle(Theme.muted)
                }
                .tint(Theme.ink)
            }
            if draft.onRelease {
                FixedRow(title: "Batch and year", value: draft.releaseTitle ?? "", reason: "From its release")
            } else {
                EditRow(title: draft.isAgave ? "LOT #" : "Batch", field: field(.batch), placeholder: draft.isAgave ? "Lot number" : "Batch 2 or B524", error: error(.batch), tracksChanges: tracks)
                EditRow(title: "Release year", field: field(.releaseYear), placeholder: "2024", keyboard: .numberPad, error: error(.releaseYear), tracksChanges: tracks)
            }
            if draft.categoryGroup != "gin" || draft.labelGinAged {
                Toggle("Single barrel", isOn: tick(.singleBarrel)).tint(Theme.ink).frame(minHeight: 44).tightRow()
                Toggle("Private selection", isOn: tick(.singleBarrelPick)).tint(Theme.ink).frame(minHeight: 44).tightRow()
            }
        } header: {
            SectionLabel("Release")
        } footer: {
            Text("What varies bottle to bottle. A release gives its proof, age and MSRP unless this bottle says otherwise.")
        }
    }

    private var barrelSection: some View {
        Section {
            if draft[.singleBarrelPick].trimmed == "true" {
                EditRow(title: "Pick name", field: field(.pick), placeholder: "Barrel #24 — Bourbon Society", error: error(.pick), tracksChanges: tracks)
                EditRow(title: "Picked by", field: field(.pickedBy), placeholder: "The club, bar or society", error: error(.pickedBy), tracksChanges: tracks)
            }
            EditRow(title: "Barrel number", field: field(.barrel), error: error(.barrel), tracksChanges: tracks)
            EditRow(title: "Bottles in the release", field: field(.bottleCount), keyboard: .numberPad, error: error(.bottleCount), tracksChanges: tracks)
            if !draft.hidesWarehouse {
                EditRow(title: "Warehouse", field: field(.warehouse), placeholder: "Warehouse H", error: error(.warehouse), tracksChanges: tracks)
                EditRow(title: "Rick / floor", field: field(.rickFloor), placeholder: "5th floor, rick 12", error: error(.rickFloor), tracksChanges: tracks)
            }
        } header: {
            SectionLabel("Single-barrel detail")
        }
    }

    // MARK: Own proof, age and size

    private var ownSection: some View {
        Section {
            BottleSizeRow(field: field(.size), error: error(.size))
            StrengthRow(proof: field(.proof), error: error(.proof), tracksChanges: tracks)
            if !draft.isAgave && draft.categoryGroup != "gin" {
                DateRow(title: "Distilled / barrel filled", field: field(.distilled), error: error(.distilled), tracksChanges: tracks)
                if draft[.distilled].isEmpty, let label = draft.labelDistilled { InheritedNote(date: label) }
                DateRow(title: "Bottled", field: field(.bottled), error: error(.bottled), tracksChanges: tracks)
                if draft[.bottled].isEmpty, let label = draft.labelBottled { InheritedNote(date: label) }
                BottleDeriveAgeRow(draft: $draft)
            }
            if draft.categoryKind == "tequila" {
                Picker(selection: field(.tequilaClass).text) {
                    Text("Same as label").tag("")
                    ForEach(SpiritChoices.tequila, id: \.value) { Text($0.title).tag($0.value) }
                } label: { Text("Class").foregroundStyle(Theme.muted) }.tint(Theme.ink)
                if let guidance = SpiritChoices.tequilaGuidance[draft[.tequilaClass].isEmpty ? draft.labelTequilaClass ?? "" : draft[.tequilaClass].trimmed] {
                    Text(guidance).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
            }
            if SpiritChoices.brandyMinimum[draft.categoryKind ?? ""] != nil {
                Picker(selection: field(.brandyGrade).text) {
                    Text("Same as label").tag("")
                    ForEach(SpiritChoices.brandyGrades, id: \.self) { Text($0).tag($0) }
                } label: { Text("Designation").foregroundStyle(Theme.muted) }.tint(Theme.ink)
                if let years = SpiritChoices.brandyMinimum[draft.categoryKind ?? ""]?[draft[.brandyGrade].trimmed] {
                    Text("At least \(years) years; add exact age only if known.").font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
            }
            if draft.categoryGroup == "gin" && draft.labelGinAged {
                Picker(selection: field(.ginIsNas).text) {
                    Text("Same as label").tag("")
                    Text("NAS").tag("true")
                    Text("Age stated").tag("false")
                } label: { Text("NAS").foregroundStyle(Theme.muted) }.tint(Theme.ink)
            }
            if (draft.categoryGroup != "gin" || draft.labelGinAged) && (draft[.tequilaClass].isEmpty ? draft.labelTequilaClass : draft[.tequilaClass].trimmed) != "blanco" {
                let nasLocked = draft.categoryGroup == "gin" && (draft[.ginIsNas].isEmpty ? draft.labelGinIsNas : draft[.ginIsNas].trimmed == "true") && !ageUnlocked
                HStack {
                AgeRow(years: field(.ageYears), months: field(.ageMonths), days: field(.ageDays),
                       error: error(.ageYears) ?? error(.ageMonths) ?? error(.ageDays))
                    .disabled(nasLocked).opacity(nasLocked ? 0.5 : 1)
                if nasLocked { Button("Edit age") { ageUnlocked = true } }
                }
                .tightRow()
                .onTapGesture(count: 3) { ageUnlocked = true }
            }
            if draft.categoryKind != "tequila" && draft.categoryGroup != "gin" {
                EditRow(title: "Age statement", field: field(.ageStatement), placeholder: "e.g. 7 Year", error: error(.ageStatement), tracksChanges: tracks)
            }
        } header: {
            SectionLabel("This bottle's own proof, age and size")
        } footer: {
            Text("Leave these blank to use the label's. A single barrel almost always differs on proof and age, and one release can come in several sizes.")
        }
    }

    // MARK: Switching the label

    /// Moves the form to another label: its releases and dates are read, and a release chosen under the old label is dropped.
    private func switchLabel(to chosen: LabelOption) async {
        guard let api = session.api else { return }
        switchError = nil
        do {
            let detail = try await api.label(id: chosen.id)
            let dropped = draft.releaseTitle
            draft[.label].text = String(chosen.id)
            draft.labelTitle = chosen.title
            draft.labelCategory = chosen.category
            draft.categoryGroup = detail.categoryGroup
            draft.categoryKind = chosen.categoryKind
            draft.labelTequilaClass = detail.tequilaClass
            draft.labelGinAged = detail.isAgedGin ?? false
            draft.labelGinIsNas = detail.isNas ?? false
            draft.releases = detail.releases.map { ReleaseChoice(id: $0.id, name: $0.name, releaseYear: $0.releaseYear) }
            draft.labelDistilled = detail.barrelFilledOn
            draft.labelBottled = detail.bottledOn
            draft[.release].text = ""
            droppedRelease = chosen.id == Int(draft[.label].original) ? nil : dropped
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            switchError = error.localizedDescription
        }
    }

    /// Puts the original label back, with its releases and the release the bottle had.
    private func revertLabel() async {
        guard let id = Int(draft[.label].original), let api = session.api else { return }
        switchError = nil
        do {
            let detail = try await api.label(id: id)
            draft[.label].revert()
            draft.labelTitle = "\(detail.brand) \(detail.name)"
            draft.labelCategory = detail.category
            draft.categoryGroup = detail.categoryGroup
            draft.categoryKind = detail.categoryKind
            draft.labelTequilaClass = detail.tequilaClass
            draft.labelGinAged = detail.isAgedGin ?? false
            draft.labelGinIsNas = detail.isNas ?? false
            draft.releases = detail.releases.map { ReleaseChoice(id: $0.id, name: $0.name, releaseYear: $0.releaseYear) }
            draft.labelDistilled = detail.barrelFilledOn
            draft.labelBottled = detail.bottledOn
            draft[.release].revert()
            droppedRelease = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            switchError = error.localizedDescription
        }
    }
}

/// Finds another label for the bottle: by name or barcode, or starts a new one, as Add a bottle does.
struct LabelSwitchSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    var onPick: (LabelOption) -> Void

    private struct NewStep: Hashable { let code: String?; let name: String }
    @State private var path: [NewStep] = []

    var body: some View {
        NavigationStack(path: $path) {
            FindLabelView(
                title: "Choose a label",
                onPick: { label, code in
                    // A scanned code no label had is saved onto the one picked; best effort, as when adding a bottle.
                    if let code, label.upc == nil, let api = session.api { Task { try? await api.attachBarcode(labelId: label.id, code: code) } }
                    onPick(label)
                    dismiss()
                },
                onNewLabel: { code, name in path.append(NewStep(code: code, name: name)) }
            )
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .navigationDestination(for: NewStep.self) { step in
                NewLabelView(code: step.code, name: step.name) { label in
                    onPick(label)
                    dismiss()
                }
            }
        }
    }
}

/// A bottle's own size: "Same as the label" (blank), the usual sizes, or any number of mL.
struct BottleSizeRow: View {
    @Binding var field: Field
    var error: String?
    @State private var other = false

    private static let same = 0
    private static let otherTag = -1

    var body: some View {
        let current = Int(field.trimmed)
        let preset = current.map { LabelRules.sizes.contains($0) } ?? false
        Picker(selection: Binding(
            get: { other || (current != nil && !preset) ? Self.otherTag : current ?? Self.same },
            set: { ml in
                switch ml {
                case Self.otherTag: other = true
                case Self.same: other = false; field.text = ""
                default: other = false; field.text = String(ml)
                }
            }
        )) {
            Text("Same as the label").tag(Self.same)
            ForEach(LabelRules.sizes, id: \.self) { Text(LabelRules.sizeTitle($0)).tag($0) }
            Text("Other size…").tag(Self.otherTag)
        } label: {
            Text("Size").foregroundStyle(Theme.muted)
        }
        .tint(Theme.ink)
        .onAppear { other = current != nil && !preset }
        if other || (current != nil && !preset) {
            EditRow(title: "Size (mL)", field: $field, keyboard: .numberPad, error: error, tracksChanges: false)
        }
    }
}

/// Under the two dates: how far apart they are, with a button that puts it in the age. Nothing moves until it is tapped.
struct BottleDeriveAgeRow: View {
    @Binding var draft: BottleDraft

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
                }
                .font(.inter(15, .semibold))
                .frame(minHeight: 44)
                .foregroundStyle(Theme.ink)
                .disabled(already)
            }
        }
    }
}
