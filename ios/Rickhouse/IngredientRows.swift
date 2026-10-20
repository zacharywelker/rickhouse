import SwiftUI

struct IngredientRows: View {
    @Environment(Session.self) private var session
    @Binding var choices: [IngredientChoice]
    let group: String
    let kind: String?
    var ginMaterial: String? = nil

    @State private var known: [IngredientChoice] = []
    @State private var name = ""
    @State private var family = "grape"
    @State private var showOther = false

    private var materialKind: String { ginMaterial ?? (group == "agave" ? "maguey" : group == "brandy" ? "distillate" : "rum_base") }
    private var title: String { ginMaterial == "botanical" ? "Botanicals" : ginMaterial == "gin_base" ? "Base spirits" : group == "agave" ? "Magueys" : group == "brandy" ? "Distillate" : "Base" }
    private var fixed: Bool { kind == "tequila" }
    private var availableFamilies: [String] {
        kind == "calvados" ? ["apple", "pear"] : kind == "cognac" || kind == "armagnac" ? ["grape"] : ["grape", "apple", "pear", "other"]
    }
    private var suggestions: [IngredientChoice] {
        known.filter { item in allowed(item) && !choices.contains(where: { $0.name.caseInsensitiveCompare(item.name) == .orderedSame }) }
    }

    var body: some View {
        if fixed {
            FixedRow(title: "Maguey", value: "Blue Weber", reason: "Fixed for tequila")
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.inter(14, .medium)).foregroundStyle(Theme.muted)
                if materialKind == "botanical" { FixedRow(title: "Juniper", value: "Included", reason: "Always in gin") }
                ForEach(choices.filter { ($0.kind == materialKind || (ginMaterial == nil && $0.kind == nil)) && !(materialKind == "botanical" && $0.name.caseInsensitiveCompare("Juniper") == .orderedSame) }) { choice in
                    HStack {
                        Text(choice.name)
                        if let family = choice.family { Text(family.capitalized).font(.inter(12)).foregroundStyle(Theme.muted) }
                        Spacer()
                        if !(materialKind == "botanical" && choice.name.caseInsensitiveCompare("Juniper") == .orderedSame) {
                        Button { choices.removeAll { $0.id == choice.id } } label: { Image(systemName: "xmark.circle") }
                            .accessibilityLabel("Remove \(choice.name)")
                        }
                    }
                }
                if let ginMaterial {
                    let presets = ginMaterial == "botanical" ? SpiritChoices.ginBotanicals : SpiritChoices.ginBases
                    ScrollView(.horizontal) {
                        HStack { ForEach(presets, id: \.self) { item in
                            Button(item) { add(item) }.buttonStyle(.bordered)
                                .disabled(choices.contains { $0.kind == ginMaterial && $0.name.caseInsensitiveCompare(item) == .orderedSame })
                        } }
                    }
                    HStack {
                        TextField("Add custom \(ginMaterial == "botanical" ? "botanical" : "base")", text: $name)
                            .textInputAutocapitalization(.words)
                        Button("Add") { add(name) }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                } else if group == "rum" && !showOther {
                    HStack {
                        ForEach(["Molasses", "Sugarcane", "Honey"], id: \.self) { base in
                            Button(base) { add(base) }.buttonStyle(.bordered)
                        }
                        Button("Other…") { showOther = true }.buttonStyle(.bordered)
                    }
                } else {
                    if group == "brandy" && availableFamilies.count > 1 {
                        Picker("Fruit", selection: $family) {
                            ForEach(availableFamilies, id: \.self) { Text($0.capitalized).tag($0) }
                        }
                    }
                    HStack {
                        TextField(group == "agave" ? "Espadín, Tobalá…" : group == "rum" ? "Other base" : "Apple, Ugni Blanc…", text: $name)
                            .textInputAutocapitalization(.words)
                        Button("Add") { add(name) }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                ForEach(suggestions.filter { name.isEmpty || $0.name.localizedCaseInsensitiveContains(name) }.prefix(8)) { item in
                    Button(item.name) { add(item.name) }.foregroundStyle(Theme.ink)
                }
            }
            .task(id: materialKind) { known = (try? await session.api?.ingredients(kind: materialKind)) ?? [] }
            .onChange(of: kind) { _, _ in
                if ginMaterial == nil { choices = choices.filter { ($0.kind == nil || $0.kind == materialKind) && allowed($0) } }
            }
        }
    }

    private func allowed(_ item: IngredientChoice) -> Bool {
        if kind == "calvados" { return item.family == "apple" || item.family == "pear" }
        if kind == "cognac" || kind == "armagnac" { return item.family == "grape" }
        return true
    }

    private func add(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 120, !choices.contains(where: { $0.kind == materialKind && $0.name.caseInsensitiveCompare(text) == .orderedSame }) else { return }
        let found = known.first { $0.name.caseInsensitiveCompare(text) == .orderedSame && allowed($0) }
        let fruit = kind == "calvados" ? (family == "pear" ? "pear" : "apple") : kind == "cognac" || kind == "armagnac" ? "grape" : family
        choices.append(found ?? IngredientChoice(name: text, family: group == "brandy" ? fruit : nil, kind: materialKind))
        name = ""
        showOther = false
    }
}
