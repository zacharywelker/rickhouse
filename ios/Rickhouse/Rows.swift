import SwiftUI

/// The shared pieces of DESIGN.md 12: a section's label, a fact read as a row, and a long list chosen from a sheet
/// (opened from `PickerRow`, in Pickers.swift).
/// The editable rows (`EditRow`, `DateRow`, `FixedRow`) are in FactEditing.swift.

/// A section's label in a list or form: small uppercase Inter, muted (12.6). The serif is for a page's headline.
struct SectionLabel: View {
    let title: String

    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title)
            .font(.inter(12, .semibold, relativeTo: .caption))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(Theme.muted)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A fact being read: its name in muted ink on the left, the value in ink on the right, at least 44 pt tall (12.1).
/// At the largest text sizes the two stack instead of squeezing each other.
struct FactRow: View {
    let title: String
    let value: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title).foregroundStyle(Theme.muted)
                Spacer(minLength: 8)
                Text(value).foregroundStyle(Theme.ink).multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(Theme.muted)
                Text(value).foregroundStyle(Theme.ink)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
        .frame(minHeight: 44)
        .tightRow()
        .accessibilityElement(children: .combine)
    }
}

extension View {
    /// A form row that sets its own 44 pt target (`frame(minHeight: 44)`): the list's default vertical inset on top of it
    /// made it ~70 pt tall, so every editable row uses this and they all come out the same height.
    func tightRow() -> some View {
        listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
    }
}

struct PickerOption: Identifiable, Hashable {
    let id: String
    let title: String
}

extension View {
    /// Choosing one of a long list from a sheet with the system search field (12.3). Open it from a `PickerRow`; a
    /// short, closed list stays a menu or a segmented control. `onChoose` is not called when the choice is unchanged.
    func optionSheet(_ title: String, isPresented: Binding<Bool>, options: [PickerOption], selection: String, onChoose: @escaping (String) -> Void) -> some View {
        sheet(isPresented: isPresented) {
            OptionSheet(title: title, options: options, selection: selection) { id in
                isPresented.wrappedValue = false
                if id != selection { onChoose(id) }
            }
        }
    }
}

private struct OptionSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let options: [PickerOption]
    let selection: String
    var onChoose: (String) -> Void

    @State private var query = ""

    private var shown: [PickerOption] {
        let typed = query.trimmingCharacters(in: .whitespaces)
        return typed.isEmpty ? options : options.filter { $0.title.localizedCaseInsensitiveContains(typed) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(shown) { option in
                    Button { onChoose(option.id) } label: {
                        HStack {
                            Text(option.title).foregroundStyle(Theme.ink)
                            Spacer()
                            if option.id == selection { Image(systemName: "checkmark").foregroundStyle(Theme.ink).accessibilityHidden(true) }
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(option.id == selection ? .isSelected : [])
                }
            }
            .overlay { if shown.isEmpty { ContentUnavailableView.search(text: query) } }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
