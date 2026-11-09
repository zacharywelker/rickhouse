import SwiftUI

/// A new mashbill (issue #223), opened from the mashbill picker's "New mashbill". It is the web's mashbill form: a
/// recipe of ingredient rows with a running total, or a secret mashbill, or a generic style. The page repeats the
/// web's rules to say what is wrong early (`MashbillDraft.problem`); the server judges again and refuses a recipe you
/// already have, in the web's words.
struct MashbillForm: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var draft: MashbillDraft
    @State private var saving = false
    @State private var error: String?
    /// The mashbill, once the server has it.
    var onMade: (LookupItem) -> Void

    /// `name` is whatever was typed in the picker's search box; a recipe has no name, so it only fills in if the
    /// mashbill turns out to be secret or generic.
    init(name: String, onMade: @escaping (LookupItem) -> Void) {
        _draft = State(initialValue: MashbillDraft(name: name))
        self.onMade = onMade
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Secret mashbill", isOn: Binding(get: { draft.isSecret }, set: { draft.setSecret($0) }))
                    Toggle("Generic style", isOn: Binding(get: { draft.isGeneric }, set: { draft.setGeneric($0) }))
                    if !draft.isGeneric { Toggle("Partial disclosure", isOn: $draft.isPartial) }
                } footer: {
                    Text(draft.isGeneric ? "A style such as High Rye or Wheated, with no recipe."
                         : draft.isSecret ? "The distillery does not publish it, so the recipe below is inferred."
                         : draft.isPartial ? "Only some grain shares are known. Leave the rest unknown rather than filling to 100%."
                         : "Add the recipe below. A secret mashbill or a style such as High Rye has its own switch.")
                }
                if draft.showsName {
                    Section {
                        TextField("Buffalo Trace Wheated, High Rye", text: $draft.name).textInputAutocapitalization(.words)
                    } header: { SectionLabel("Name") } footer: {
                        Text("Shown in place of the recipe. A trailing style such as (Low Rye) is tagged for tournament matching.")
                    }
                }
                if draft.showsIngredients {
                    Section {
                        if draft.rows.isEmpty {
                            Text(draft.isSecret ? "No ingredients yet. A secret mashbill can stay empty until you have inferred its recipe."
                                 : "No ingredients yet.")
                                .font(.inter(14, relativeTo: .callout)).foregroundStyle(Theme.muted)
                        }
                        ForEach($draft.rows) { $row in grainRow($row) }
                            .onDelete { draft.rows.remove(atOffsets: $0) }
                        addMenu
                    } header: { SectionLabel("Ingredients") }
                    if !draft.rows.isEmpty { totalSection }
                }
                Section {
                    TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(3...6)
                }
                if let hint = draft.problem, !saving {
                    Section { Text(hint).font(.inter(14, relativeTo: .callout)).foregroundStyle(Theme.muted) }
                }
                if let error { Section { ErrorText(error) } }
            }
            .scrollContentBackground(.hidden)
            .keyboardDone()
            .background(Theme.paper)
            .navigationTitle("New mashbill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Add", action: save).fontWeight(.semibold)
                        .disabled(saving || !draft.canSave)
                }
            }
        }
    }

    private func grainRow(_ row: Binding<GrainRow>) -> some View {
        HStack(spacing: 10) {
            Circle().fill(IngredientColor.color(for: row.wrappedValue.grain)).frame(width: 12, height: 12)
                .overlay(Circle().stroke(Theme.muted.opacity(0.4), lineWidth: 0.5))
                .accessibilityHidden(true)
            TextField("Corn", text: row.grain).textInputAutocapitalization(.words)
                .accessibilityLabel("Ingredient")
            TextField("%", text: row.percent)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .frame(width: 64)
                .accessibilityLabel("\(row.wrappedValue.grain.isEmpty ? "Ingredient" : row.wrappedValue.grain) percent")
        }
        .frame(minHeight: 44)
    }

    /// The common ingredients not already in the recipe, then a blank row for anything else.
    private var addMenu: some View {
        Menu {
            ForEach(draft.unusedCommonGrains, id: \.self) { grain in
                Button(grain) { draft.rows.append(GrainRow(grain: grain)) }
            }
            Button("Other…") { draft.rows.append(GrainRow()) }
        } label: {
            Label("Add an ingredient", systemImage: "plus").frame(minHeight: 44)
        }
    }

    private var totalSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Grain total").foregroundStyle(Theme.muted)
                    Spacer()
                    Text("\(MashbillDraft.text(draft.roundedTotal))%").font(.inter(18, .semibold)).monospacedDigit()
                        .foregroundStyle(totalColor)
                }
                bar
                Text(statusLine).font(.inter(12, relativeTo: .caption)).foregroundStyle(statusIsBad ? Color.red : Theme.muted)
                    .accessibilityLabel(statusLine)
            }
            .padding(.vertical, 4)
        }
    }

    /// One segment per ingredient in its own colour, so the mix reads at a glance.
    private var bar: some View {
        let span = max(100, draft.total)
        return GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(draft.rows.filter { ($0.share ?? 0) > 0 }) { row in
                    Rectangle().fill(IngredientColor.color(for: row.grain))
                        .frame(width: geo.size.width * CGFloat((row.share ?? 0) / span))
                }
                Spacer(minLength: 0)
            }
            .background(Theme.muted.opacity(0.2))
            .clipShape(Capsule())
        }
        .frame(height: 10)
        .accessibilityHidden(true)
    }

    private var statusIsBad: Bool {
        switch draft.totalStatus {
        case .short, .over: return true
        case .exact, .tolerated, .undisclosed: return false
        }
    }

    private var totalColor: Color { statusIsBad ? .red : Theme.ink }

    private var statusLine: String {
        switch draft.totalStatus {
        case .exact: return "Adds up to 100%."
        case .tolerated: return "Within the rounding tolerance the database allows (99–101%)."
        case .short(let gap): return "\(MashbillDraft.text(gap))% short of 100%."
        case .over(let gap): return "\(MashbillDraft.text(gap))% over 100%."
        case .undisclosed(let gap): return "\(MashbillDraft.text(gap))% remains undisclosed."
        }
    }

    private func save() {
        guard let api = session.api, !saving, draft.canSave else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                let made = try await api.createMashbill(draft)
                onMade(LookupItem(id: made.id, name: made.name))
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// The colour each common ingredient is drawn in (the web's `ingredientColor`), so a recipe reads the same on both.
/// Anything else gets a steady colour of its own from its name, by the same hash.
enum IngredientColor {
    private static let known: [String: (Double, Double, Double)] = [
        "corn": (0xe8, 0xb0, 0x2e), "rye": (0xa8, 0x43, 0x2c), "wheat": (0xc9, 0xb4, 0x8a), "malted barley": (0x6b, 0x4a, 0x2b),
        "sugarcane": (0x6f, 0xa8, 0x5b), "molasses": (0x3b, 0x2a, 0x25), "agave": (0x4f, 0x9d, 0xa6),
    ]

    static func color(for ingredient: String) -> Color {
        let key = ingredient.trimmingCharacters(in: .whitespaces).lowercased()
        if let rgb = known[key] { return Color(red: rgb.0 / 255, green: rgb.1 / 255, blue: rgb.2 / 255) }
        if key.isEmpty { return Color(red: 0x9c / 255, green: 0xa3 / 255, blue: 0xaf / 255) }
        return Color(hue: Double(hue(key)) / 360, saturation: 0.35, lightnessApprox: 0.52)
    }

    /// The web's `hash * 31 + code` over UTF-16 units, kept to 32 bits, modulo 360.
    static func hue(_ key: String) -> Int {
        var hash: UInt32 = 0
        for unit in key.utf16 { hash = hash &* 31 &+ UInt32(unit) }
        return Int(hash % 360)
    }
}

private extension Color {
    /// HSL, as the web writes it, through the HSB initialiser SwiftUI has.
    init(hue: Double, saturation s: Double, lightnessApprox l: Double) {
        let b = l + s * min(l, 1 - l)
        self.init(hue: hue, saturation: b == 0 ? 0 : 2 * (1 - l / b), brightness: b)
    }
}
