import SwiftUI

/// The label a tasting is of, as the form needs it.
struct TastingLabel: Hashable {
    let id: Int
    let title: String
    let category: String
    /// The flavor wheel its category uses; nil where the family has none yet.
    let wheel: String?

    init(id: Int, title: String, category: String, wheel: String?) {
        self.id = id
        self.title = title
        self.category = category
        self.wheel = wheel
    }

    init(_ label: LabelOption) {
        id = label.id
        title = label.title
        category = label.category
        wheel = label.wheel
    }

    init(_ label: LabelDetail) {
        id = label.id
        title = "\(label.brand) \(label.name)"
        category = label.category
        wheel = label.wheel
    }
}

/// The bottle of yours a tasting is on, as the form needs it.
struct TastingBottle: Hashable {
    let id: Int
    let title: String

    init(id: Int, title: String) {
        self.id = id
        self.title = title
    }

    init(_ bottle: LabelBottle) {
        self.init(id: bottle.id, title: bottle.title)
    }
}

/// Log a tasting, or edit one: when and where, a rating, flavors from the label's wheel, and what you wrote.
/// It sits in the navigation of whatever shows it (the Log a tasting flow, or a sheet over the label page).
/// A failed save leaves it as it is, so nothing typed is lost to a bad connection.
struct TastingFormView: View {
    @Environment(Session.self) private var session

    let label: TastingLabel
    /// The bottle of yours this tasting is on; nil for a pour from elsewhere.
    let bottle: TastingBottle?
    /// The tasting being edited; nil when logging a new one.
    var existing: LabelTasting?
    var onSaved: () -> Void

    @State private var date = Date()
    @State private var source = TastingSource.bar
    @State private var tastedAt = ""
    @State private var rated = false
    @State private var rating = 7.0
    @State private var chosen: [String] = []
    @State private var overall = ""
    @State private var nose = ""
    @State private var palate = ""
    @State private var finish = ""
    @State private var saving = false
    @State private var confirmingDelete = false
    @State private var error: String?
    @State private var filled = false

    init(label: TastingLabel, bottle: TastingBottle? = nil, existing: LabelTasting? = nil, onSaved: @escaping () -> Void) {
        self.label = label
        self.bottle = bottle
        self.existing = existing
        self.onSaved = onSaved
    }

    /// On one of your bottles, now or when it was logged.
    private var onBottle: Bool { bottle != nil || existing?.bottleId != nil }

    private var sources: [TastingSource] {
        existing?.source == TastingSource.owned.rawValue ? TastingSource.allCases : TastingSource.elsewhere
    }

    private var wheel: TastingWheel? { label.wheel.flatMap { session.wheels[$0] } }

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label.title).font(.inter(17, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                    Text(label.category).font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                }
            }
            Section {
                if let bottle {
                    LabeledContent("Your bottle", value: bottle.title)
                } else if !onBottle {
                    Picker("Where", selection: $source) {
                        ForEach(sources) { Text($0.title).tag($0) }
                    }
                    TextField("Place (optional)", text: $tastedAt)
                }
                DatePicker("Tasted", selection: $date, in: ...Date(), displayedComponents: .date)
                Toggle("Rating", isOn: $rated)
                if rated {
                    Stepper(value: $rating, in: 0...10, step: 0.5) {
                        Text("\(rating.formatted()) / 10").monospacedDigit()
                    }
                }
            }
            if let wheel {
                FlavorSection(wheel: wheel, subject: label.title, chosen: $chosen)
            } else if label.wheel == nil {
                Section {
                    Text("There isn't a flavor list for \(label.category) yet. Write what you taste below.")
                        .font(.inter(14)).foregroundStyle(Theme.muted)
                }
            }
            Section("Nose") { TextField("What you smell", text: $nose, axis: .vertical) }
            Section("Palate") { TextField("What you taste", text: $palate, axis: .vertical) }
            Section("Finish") { TextField("How it ends", text: $finish, axis: .vertical) }
            Section("Overall") { TextField("In a line", text: $overall, axis: .vertical) }
            if let error { Section { ErrorText(error) } }
            if existing != nil {
                Section {
                    Button("Delete this tasting", role: .destructive) { confirmingDelete = true }
                }
            }
        }
        .font(.inter(16))
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle(existing == nil ? "Log a tasting" : "Edit tasting")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(saving ? "Saving…" : error == nil ? "Save" : "Retry", action: save).disabled(saving)
            }
        }
        .confirmSheet("Delete this tasting?", message: "This can't be undone.", confirm: "Delete tasting", isPresented: $confirmingDelete, perform: delete)
        .task { await session.loadWheels() }
        .onAppear(perform: fill)
    }

    /// Edits start from what was saved; filled once, so coming back from the flavor wheel doesn't undo anything.
    private func fill() {
        guard !filled, let existing else { return }
        filled = true
        date = Format.date(fromISO: existing.tastedOn) ?? Date()
        if let value = existing.rating.flatMap(Double.init) {
            rated = true
            rating = value
        }
        source = existing.source.flatMap(TastingSource.init(rawValue:)) ?? .bar
        tastedAt = existing.tastedAt ?? ""
        chosen = existing.tags ?? []
        overall = existing.overall ?? ""
        nose = existing.nose ?? ""
        palate = existing.palate ?? ""
        finish = existing.finish ?? ""
    }

    private var tasting: TastingBody {
        func text(_ value: String) -> String? {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return TastingBody(
            expressionId: existing == nil ? label.id : nil,
            bottleId: existing == nil ? bottle?.id : nil,
            source: onBottle ? TastingSource.owned.rawValue : source.rawValue,
            tastedAt: onBottle ? nil : text(tastedAt),
            tastedOn: Format.isoDay(date),
            rating: rated ? rating : nil,
            tags: chosen,
            nose: text(nose), palate: text(palate), finish: text(finish), overall: text(overall)
        )
    }

    private func save() {
        guard let api = session.api else { return }
        saving = true
        error = nil
        Task {
            do {
                if let existing {
                    try await api.updateTasting(id: existing.id, tasting)
                } else {
                    _ = try await api.createTasting(tasting)
                }
                onSaved()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }

    private func delete() {
        guard let api = session.api, let existing else { return }
        saving = true
        Task {
            do {
                try await api.deleteTasting(id: existing.id)
                onSaved()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }
}
