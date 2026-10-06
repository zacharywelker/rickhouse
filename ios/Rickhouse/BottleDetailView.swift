import SwiftUI

struct BottleDetailView: View {
    @Environment(Session.self) private var session
    let id: Int
    /// Told when something on the bottle changed that the collection shows (its level).
    var onChanged: () -> Void = {}

    @State private var bottle: BottleDetail?
    @State private var error: String?
    @State private var actionError: String?
    @State private var settingFill = false
    @State private var editing: NoteEdit?

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
        .sheet(item: $editing) { edit in
            NoteEditorView(bottleId: id, note: edit.note) { Task { await load() } }
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
            fillSection(b)
            Section("Label") {
                row("Category", b.category)
                row("Proof", b.proof.flatMap(Double.init).map { $0.formatted() })
                row("Age", b.ageStatement)
                row("Size", "\(b.sizeMl) mL")
                row("Distilleries", b.distilleries.joined(separator: ", "))
                row("Mashbill", b.mashbills.joined(separator: ", "))
                row("Finishes", b.finishes.joined(separator: ", "))
            }
            Section("Bottle") {
                row("Status", b.status.capitalized)
                row("Opened", b.dateOpened.map(Self.day))
                row("Batch", b.batch)
                row("Barrel", b.barrelNumber)
                row("Pick", b.pickName)
                row("Paid", b.pricePaid.map(Self.money))
                row("MSRP", b.msrp.map(Self.money))
                row("Store", b.store)
                row("Acquired", b.dateAcquired.map(Self.day))
                row("Location", b.location)
            }
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
        .navigationTitle(b.name)
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
                            Text(Self.day(note.tastedOn)).font(.inter(15, .semibold)).monospacedDigit()
                            Spacer()
                            if let rating = note.rating.flatMap(Double.init) {
                                Text("\(rating.formatted()) / 10").font(.inter(15, .medium)).monospacedDigit()
                            }
                        }
                        ForEach(lines(of: note), id: \.0) { label, text in
                            (Text(label + " ").font(.inter(14, .medium)).foregroundStyle(Theme.muted) + Text(text).font(.inter(14)))
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())  // the whole row opens the note, not just its text
                }
                .buttonStyle(.plain)
            }
            Button { editing = NoteEdit(note: nil) } label: {
                Label("Add a tasting note", systemImage: "plus")
            }
        }
    }

    private func lines(of note: TastingNote) -> [(String, String)] {
        [("Nose", note.nose), ("Palate", note.palate), ("Finish", note.finish), ("Overall", note.overall)]
            .compactMap { label, text in text.flatMap { $0.isEmpty ? nil : (label, $0) } }
    }

    // MARK: Loading

    /// "2026-10-06" as the reader's short date. Built from parts, not parsed, so the day never shifts with the time zone.
    private static func day(_ iso: String) -> String {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return iso }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    private static func money(_ amount: String) -> String {
        Double(amount).map { $0.formatted(.currency(code: "USD")) } ?? "$" + amount
    }

    /// Hidden when there is nothing to say, so the sheet only shows what is recorded.
    @ViewBuilder
    private func row(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            LabeledContent(label, value: value)
        }
    }

    private func load() async {
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
