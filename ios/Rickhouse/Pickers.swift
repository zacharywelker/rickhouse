import SwiftUI

/// Chooses from names you already have: your brands, distilleries, mashbills, finishes or stores
/// (docs/superpowers/specs/2026-10-08-edit-facts-design.md, section 1). One screen serves all five: a search box,
/// what is already chosen on top, near matches before "add a new one", and for the kinds a name is enough to make,
/// a last row that makes it.
struct PickerSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    let kind: LookupKind
    let title: String
    /// Several can be ticked (Done saves them), or one is chosen and the sheet closes.
    let multiple: Bool
    let initial: [LookupItem]
    /// A single choice that may be nothing (a bottle with no store).
    var allowNone = false
    var onDone: ([LookupItem]) -> Void

    @State private var items: [LookupItem] = []
    @State private var selected: [LookupItem] = []
    @State private var query = ""
    @State private var searching = false
    @State private var loading = true
    @State private var creating = false
    @State private var error: String?

    private var typed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func isSelected(_ item: LookupItem) -> Bool { selected.contains { $0.id == item.id } }

    var body: some View {
        NavigationStack {
            List {
                if let error { Section { ErrorText(error) } }
                if allowNone && typed.isEmpty {
                    Section {
                        Button { choose(nil) } label: { rowLabel("None", detail: nil, ticked: selected.isEmpty) }
                            .accessibilityAddTraits(selected.isEmpty ? .isSelected : [])
                    }
                }
                if multiple && typed.isEmpty && !selected.isEmpty {
                    Section("On this label") { ForEach(selected) { row($0) } }
                }
                let rest = PickerLogic.matching(typed, in: items).filter { !(multiple && typed.isEmpty && isSelected($0)) }
                if !rest.isEmpty {
                    Section(typed.isEmpty ? "Your \(kind.rawValue)" : "Matches") { ForEach(rest) { row($0) } }
                }
                if PickerLogic.exact(typed, in: items) == nil {
                    let near = PickerLogic.nearMatches(typed, in: items).filter { n in !rest.contains { $0.id == n.id } }
                    if !near.isEmpty { Section("Did you mean") { ForEach(near) { row($0) } } }
                }
                if PickerLogic.offersNew(typed, kind: kind, in: items) {
                    Section {
                        Button(action: create) {
                            HStack {
                                Text("Add “\(typed)” as a new \(kind.singular)").font(.inter(16, .semibold))
                                Spacer()
                                if creating { ProgressView() } else { Image(systemName: "plus") }
                            }
                            .frame(minHeight: 44)
                        }
                        .disabled(creating)
                        .foregroundStyle(Theme.paper)
                        .listRowBackground(Theme.ink)
                    } footer: {
                        Text("New names join your list and can be used on any label.")
                    }
                }
                if !loading && items.isEmpty && typed.isEmpty && error == nil {
                    Section {
                        Text(kind.creatable ? "Nothing here yet. Type a name to add one." : "Nothing here yet. Add them on the web.")
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .searchable(text: $query, isPresented: $searching, placement: .navigationBarDrawer(displayMode: .always), prompt: kind.creatable ? "Search or add a \(kind.singular)" : "Search your \(kind.rawValue)")
            .textInputAutocapitalization(.words)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                if multiple {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { onDone(selected); dismiss() }.fontWeight(.semibold)
                    }
                }
            }
        }
        .task { await load() }
    }

    private func row(_ item: LookupItem) -> some View {
        Button { choose(item) } label: { rowLabel(item.name, detail: item.detail, ticked: isSelected(item)) }
            .accessibilityAddTraits(isSelected(item) ? .isSelected : [])
    }

    private func rowLabel(_ name: String, detail: String?, ticked: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(name).foregroundStyle(Theme.ink)
                if let detail { Text(detail).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted) }
            }
            Spacer()
            if ticked { Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(Theme.ink).accessibilityHidden(true) }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    /// A tap: tick or untick when several can be chosen, otherwise choose and close.
    private func choose(_ item: LookupItem?) {
        // While searching, iOS swaps Cancel and Done for the search field, so a choice ends the search.
        if !query.isEmpty { query = "" }
        searching = false
        if multiple, let item {
            if let at = selected.firstIndex(where: { $0.id == item.id }) { selected.remove(at: at) } else { selected.append(item) }
        } else {
            onDone(item.map { [$0] } ?? [])
            dismiss()
        }
    }

    private func load() async {
        guard let api = session.api else { return }
        selected = initial
        loading = true
        defer { loading = false }
        do {
            items = try await api.lookups(kind)
            // Whatever is already chosen is on the list, even if the list came back without it.
            for item in initial where !items.contains(where: { $0.id == item.id }) { items.append(item) }
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func create() {
        guard let api = session.api, !creating else { return }
        creating = true
        error = nil
        let name = typed
        Task {
            defer { creating = false }
            do {
                let made = try await api.createLookup(kind, name: name)
                let item = LookupItem(id: made.id, name: made.name)
                if !items.contains(where: { $0.id == item.id }) {
                    items.append(item)
                    items.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                }
                query = ""
                choose(item)
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// What a picker is open for.
enum PickTarget: Identifiable {
    case brand, store
    case list(LinkList)

    var id: String {
        switch self {
        case .brand: "brand"
        case .store: "store"
        case .list(let list): "\(list)"
        }
    }
}

/// A fact chosen from a picker: its value with a chevron, and once changed a dot and a ↺ that puts it back.
struct PickerRow: View {
    let title: String
    let value: String
    var changed = false
    var onOpen: () -> Void
    var onRevert: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onOpen) {
                HStack(spacing: 6) {
                    if changed { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
                    Text(title).foregroundStyle(Theme.muted)
                    Spacer(minLength: 8)
                    Text(value).foregroundStyle(Theme.ink).multilineTextAlignment(.trailing)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.muted).accessibilityHidden(true)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(title), \(value)")
            .accessibilityHint("Opens the list")
            if changed {
                Button(action: onRevert) {
                    Image(systemName: "arrow.uturn.backward.circle").font(.system(size: 20)).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.ink)
                .accessibilityLabel("Put back \(title)")
            }
        }
    }
}

/// A list on a label as chips you can take off, and a "+ Add" that opens its picker.
struct LinkChipsRow: View {
    let title: String
    let rows: [LinkRow]
    var changed = false
    var onRemove: (LinkRow) -> Void
    var onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if changed { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
                Text(title).foregroundStyle(Theme.muted)
            }
            FlowLayout(spacing: 6) {
                ForEach(rows) { row in
                    Button { onRemove(row) } label: {
                        HStack(spacing: 4) {
                            Text(row.name).font(.inter(14))
                            Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).accessibilityHidden(true)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.ink, lineWidth: 1))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                    .accessibilityLabel("Remove \(row.name) from \(title.lowercased())")
                }
                Button(action: onAdd) {
                    Text("+ Add").font(.inter(14, .medium))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.muted, style: StrokeStyle(lineWidth: 1, dash: [3])))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.muted)
                .accessibilityLabel("Add to \(title.lowercased())")
            }
        }
        .padding(.vertical, 2)
    }
}
