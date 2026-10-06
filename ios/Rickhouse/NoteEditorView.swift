import SwiftUI

/// Adds a tasting note to a bottle, or edits or deletes one. A failed save
/// leaves the sheet as it is, so nothing typed is lost to a bad connection.
struct NoteEditorView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    let bottleId: Int
    let note: TastingNote?
    var onSaved: () -> Void

    @State private var date = Date()
    @State private var rated = false
    @State private var rating = 7.0
    @State private var nose = ""
    @State private var palate = ""
    @State private var finish = ""
    @State private var overall = ""
    @State private var saving = false
    @State private var confirmingDelete = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Tasted", selection: $date, in: ...Date(), displayedComponents: .date)
                    Toggle("Rating", isOn: $rated)
                    if rated {
                        Stepper(value: $rating, in: 0...10, step: 0.5) {
                            Text("\(rating.formatted()) / 10").monospacedDigit()
                        }
                    }
                }
                Section("Nose") { TextField("What you smell", text: $nose, axis: .vertical) }
                Section("Palate") { TextField("What you taste", text: $palate, axis: .vertical) }
                Section("Finish") { TextField("How it ends", text: $finish, axis: .vertical) }
                Section("Overall") { TextField("In a line", text: $overall, axis: .vertical) }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                if note != nil {
                    Section {
                        Button("Delete this note", role: .destructive) { confirmingDelete = true }
                    }
                }
            }
            .font(.inter(16))
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle(note == nil ? "New note" : "Edit note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : error == nil ? "Save" : "Retry", action: save).disabled(saving)
                }
            }
            .confirmationDialog("Delete this note?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive, action: delete)
            }
            .onAppear(perform: fill)
        }
    }

    private func fill() {
        guard let note else { return }
        date = Self.isoDay.date(from: note.tastedOn) ?? Date()
        if let value = note.rating.flatMap(Double.init) {
            rated = true
            rating = value
        }
        nose = note.nose ?? ""
        palate = note.palate ?? ""
        finish = note.finish ?? ""
        overall = note.overall ?? ""
    }

    private var body_: NoteBody {
        func text(_ value: String) -> String? {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return NoteBody(tastedOn: Self.isoDay.string(from: date), rating: rated ? rating : nil,
                        nose: text(nose), palate: text(palate), finish: text(finish), overall: text(overall))
    }

    private func save() {
        guard let api = session.api else { return }
        saving = true
        error = nil
        Task {
            do {
                if let note {
                    try await api.updateNote(bottleId: bottleId, noteId: note.id, body_)
                } else {
                    try await api.addNote(bottleId: bottleId, body_)
                }
                onSaved()
                dismiss()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }

    private func delete() {
        guard let api = session.api, let note else { return }
        saving = true
        Task {
            do {
                try await api.deleteNote(bottleId: bottleId, noteId: note.id)
                onSaved()
                dismiss()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
