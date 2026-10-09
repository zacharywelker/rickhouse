import SwiftUI

struct BottleDetailView: View {
    @Environment(Session.self) var session
    let id: Int
    /// Told when something on the bottle changed that the collection shows (its level).
    var onChanged: () -> Void = {}

    @State var bottle: BottleDetail?
    @State private var error: String?
    @State private var actionError: String?
    @State private var settingFill = false
    @State private var editing: NoteEdit?

    // Editing the bottle's and the label's facts (docs/superpowers/specs/2026-10-08-edit-facts-design.md). The views are in
    // BottleDetailEditing.swift; the state is here because an extension can't hold it.
    @State var bottleDraft: BottleDraft?
    @State var labelDraft: LabelDraft?
    @State var labelId: Int?
    @State var labelBottleCount = 0
    @State var revealed: Set<BottleFact> = []
    @State var lastRevealed: BottleFact?
    @State var savingFacts = false
    @State var factError: String?
    @State var fieldErrors: [String: String] = [:]
    @State var askOpened = false
    @State var discarding = false
    @State var categories: [CategoryOption] = []
    @State var undoOffer: UndoOffer?
    @State var undoTimer: Task<Void, Never>?
    @State var picking: PickTarget?

    private struct NoteEdit: Identifiable {
        let id = UUID()
        let note: TastingNote?
    }

    var body: some View {
        Group {
            if let bottle {
                content(bottle)
            } else if let error {
                ContentUnavailableView("Couldn't load", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .background(Theme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task { await session.loadWheels() }
        .confirmationDialog("Discard your changes?", isPresented: $discarding, titleVisibility: .visible) {
            Button("Discard changes", role: .destructive) { stopEditing() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("Nothing you changed has been saved.")
        }
        .confirmationDialog("Keep the bottle open or mark it sealed?", isPresented: $askOpened, titleVisibility: .visible) {
            Button("Keep it open, no date") { saveBottle(choice: .keepOpen) }
            Button("Mark it sealed") { saveBottle(choice: .seal) }
            Button("Keep the date", role: .cancel) { bottleDraft?[.opened].revert() }
        } message: {
            Text("You cleared the date it was opened. It is at about \(bottle?.fillPct ?? 0)%. Sealed sets the level back to full.")
        }
        .overlay(alignment: .bottom) {
            if let offer = undoOffer { UndoBar(offer: offer) { runUndo(offer) } }
        }
        .animation(.default, value: undoOffer?.id)
        .sheet(item: $picking) { pickerSheet(for: $0) }
        .sheet(item: $editing) { edit in
            if let bottle, let expressionId = bottle.expressionId {
                NavigationStack {
                    TastingFormView(
                        label: TastingLabel(id: expressionId, title: "\(bottle.brand) \(bottle.name)", category: bottle.category, wheel: bottle.wheel),
                        bottle: TastingBottle(id: id, title: Self.title(of: bottle)),
                        existing: edit.note.map { LabelTasting($0, bottleId: id) }
                    ) {
                        editing = nil
                        Task { await load() }
                    }
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editing = nil } } }
                }
            }
        }
    }

    private func content(_ b: BottleDetail) -> some View {
        let plate = CategoryPalette.color(for: b.category)
        return List {
            if !b.images.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(b.images) { image in
                            // Same slot as the gallery: whole picture, on the category's colour.
                            Color.clear
                                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                                .overlay { AuthenticatedImage(path: image.path, contentMode: .fit, background: plate).padding(6) }
                                .clipped()
                                .frame(width: 210)
                                .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(b.brand).font(.inter(13, .medium, relativeTo: .subheadline)).foregroundStyle(Theme.muted)
                    Text(b.name).font(.headline(26)).foregroundStyle(Theme.ink)
                }
                .padding(.vertical, 4)
            }
            if let until = b.mutedUntil {
                mutedSection(b, until: until)
            }
            fillSection(b)
            labelSection(b)
            bottleSection(b)
            if let notes = b.notes, !notes.isEmpty {
                // Free text gets the full width; a trailing LabeledContent value squeezes it.
                VStack(alignment: .leading, spacing: 4) {
                    Text("Notes").font(.inter(14, .medium)).foregroundStyle(Theme.muted)
                    Text(notes)
                }
            }
            notesSection(b)
        }
        .font(.inter(16))
        .scrollContentBackground(.hidden)
        .contentMargins(.top, 8, for: .scrollContent)  // the grouped list adds its own gap under the navigation bar
        .navigationTitle(b.name)
    }

    // MARK: Muted

    /// The bottle is held out of What to drink tonight and Roulette until a date; this says so and lets it back in.
    private func mutedSection(_ b: BottleDetail, until: String) -> some View {
        Section {
            HStack {
                Label("Muted until \(Format.day(until))", systemImage: "bell.slash")
                    .font(.inter(16, .medium))
                Spacer()
                Button("Unmute") { Task { await unmute() } }
                    .frame(minHeight: 44)
            }
        } footer: {
            Text("Out of tonight's picks, Roulette included. Change the date in Account, Muted bottles.")
        }
    }

    private func unmute() async {
        guard let api = session.api else { return }
        do {
            try await api.unmute(bottleId: id)
            await load()
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            actionError = error.localizedDescription
        }
    }

    // MARK: Fill level

    private func fillSection(_ b: BottleDetail) -> some View {
        let state = FillState.of(b.fillPct)
        return Section("Fill level") {
            HStack(spacing: 10) {
                FillGauge(percent: b.fillPct, track: Theme.ink.opacity(0.15)).frame(width: 4, height: 28)
                Text(state.text + (b.isOpen ? " · open" : "")).font(.inter(16, .medium))
            }
            .accessibilityElement(children: .combine)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(FillState.all) { option in
                    Button { Task { await setFill(option.percent) } } label: {
                        Text(option.label)
                            .font(.inter(15, .medium))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(option == state ? Theme.paper : Theme.ink)
                            .background(option == state ? Theme.ink : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.ink, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(settingFill)
                    .accessibilityLabel(option.spoken)
                    .accessibilityAddTraits(option == state ? .isSelected : [])
                }
            }
            .padding(.vertical, 4)
            if let actionError {
                ErrorText(actionError)
            }
        }
    }

    /// The level moves at once; if the server says no, it goes back and says why.
    private func setFill(_ percent: Int) async {
        guard let api = session.api, let before = bottle, percent != before.fillPct else { return }
        settingFill = true
        defer { settingFill = false }
        actionError = nil
        bottle?.fillPct = percent
        do {
            let result = try await api.setFill(bottleId: id, to: percent)
            bottle?.fillPct = result.fillPct
            bottle?.isOpen = result.isOpen
            bottle?.status = result.status
            bottle?.dateOpened = result.dateOpened
            onChanged()
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            bottle = before
            actionError = error.localizedDescription
        }
    }

    // MARK: Tasting notes

    private func notesSection(_ b: BottleDetail) -> some View {
        Section("Tasting notes") {
            ForEach(b.tastingNotes) { note in
                Button { editing = NoteEdit(note: note) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(Format.day(note.tastedOn)).font(.inter(15, .semibold)).monospacedDigit()
                            Spacer()
                            if let rating = note.rating.flatMap(Double.init) {
                                Text("\(rating.formatted()) / 10").font(.inter(15, .medium)).monospacedDigit()
                            }
                        }
                        if let pour = Format.pour(source: note.source, tastedAt: note.tastedAt) {
                            Text(pour).font(.inter(13)).foregroundStyle(Theme.muted)
                        }
                        if let flavors = note.tags, !flavors.isEmpty {
                            Text(flavors.map(session.flavorName).joined(separator: ", ")).font(.inter(14, .medium)).foregroundStyle(Theme.ink)
                        }
                        ForEach(lines(of: note), id: \.0) { label, text in
                            Text("\(Text(label + " ").font(.inter(14, .medium)).foregroundStyle(Theme.muted))\(Text(text).font(.inter(14)))")
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())  // the whole row opens the note, not just its text
                }
                .buttonStyle(.plain)
            }
            if b.expressionId != nil {
                Button { editing = NoteEdit(note: nil) } label: {
                    Label("Add a tasting note", systemImage: "plus")
                }
            }
        }
    }

    /// What tells this bottle from another of its label, in a few words.
    private static func title(of b: BottleDetail) -> String {
        let parts = [
            b.pickName.map { "“\($0)”" },
            b.barrelNumber.map { "barrel \($0)" },
            b.batch,
            b.releaseYear.map(String.init),
        ].compactMap { $0 }
        return parts.isEmpty ? "Standard release" : parts.joined(separator: ", ")
    }

    private func lines(of note: TastingNote) -> [(String, String)] {
        [("Nose", note.nose), ("Palate", note.palate), ("Finish", note.finish), ("Overall", note.overall)]
            .compactMap { label, text in text.flatMap { $0.isEmpty ? nil : (label, $0) } }
    }

    // MARK: Loading

    /// Hidden when there is nothing to say, so the sheet only shows what is recorded.
    @ViewBuilder
    func row(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            LabeledContent(label, value: value)
        }
    }

    func load() async {
        guard let api = session.api else { return }
        do {
            bottle = try await api.bottle(id: id)
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
