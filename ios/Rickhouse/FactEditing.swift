import SwiftUI

/// The pieces the bottle page's edit mode is built from (docs/superpowers/specs/2026-10-08-edit-facts-design.md, section 1).

/// One fact as a row: its name, a text field, and once changed a dot, the old value and a ↺ that puts it back.
struct EditRow: View {
    let title: String
    @Binding var field: Field
    var placeholder = ""
    var keyboard: UIKeyboardType = .default
    var prefix: String?
    var multiline = false
    var error: String?
    /// Set on a row the person just asked for, so they can type at once.
    var focusOnAppear = false
    /// Off on a form for something new, where there is nothing to put back.
    var tracksChanges = true

    @FocusState private var focused: Bool
    /// A price changes in place: no ↺ and no "was", which would resize the row as you type.
    private var showsChange: Bool { tracksChanges && prefix != "$" && field.changed }

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(alignment: multiline ? .top : .firstTextBaseline, spacing: 8) {
                HStack(spacing: 6) {
                    if showsChange { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
                    Text(title).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 8)
                if let prefix, !field.isEmpty { Text(prefix).foregroundStyle(Theme.muted) }
                TextField(placeholder.isEmpty ? title : placeholder, text: $field.text, axis: multiline ? .vertical : .horizontal)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(keyboard)
                    // A prefix ("$") has to sit against the value, so the field takes only the width it needs.
                    .fixedSize(horizontal: prefix != nil, vertical: false)
                    .focused($focused)
                    .foregroundStyle(error == nil ? Theme.ink : Theme.error)
                    .padding(.bottom, 1)
                    .overlay(alignment: .bottom) {
                        if focused || error != nil { Rectangle().fill(error == nil ? Theme.ink : Theme.error).frame(height: 2) }
                    }
                    .accessibilityLabel(title)
                if showsChange {
                    Button { field.revert() } label: {
                        Image(systemName: "arrow.uturn.backward.circle").font(.system(size: 20))
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                    .accessibilityLabel("Put back \(field.original.isEmpty ? "nothing" : field.original) for \(title)")
                }
            }
            if showsChange, !field.original.isEmpty {
                Text("was \(field.original)").font(.inter(11, relativeTo: .caption2)).foregroundStyle(Theme.muted).strikethrough()
            }
            if let error { Text(error).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.error) }
        }
        .padding(.vertical, 2)
        .onAppear { if focusOnAppear { focused = true } }
        .onChange(of: field.text) { _, text in
            // "$" marks a price: stop at the cents rather than refuse the save.
            if prefix == "$" { let clean = Format.moneyInput(text); if clean != text { field.text = clean } }
        }
    }
}

/// A date fact: "Add date" when there is none, else the date with a way to clear it. Never later than today.
struct DateEditRow: View {
    let title: String
    @Binding var field: Field
    var error: String?

    private var date: Binding<Date> {
        Binding(
            get: { Format.date(fromISO: field.text) ?? Date() },
            set: { field.text = Format.isoDay($0) }
        )
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    if field.changed { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
                    Text(title).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 8)
                if field.isEmpty {
                    Button("Add date") { field.text = Format.isoDay(Date()) }.frame(minHeight: 44)
                } else {
                    DatePicker(title, selection: date, in: ...Date(), displayedComponents: .date).labelsHidden()
                    Button { field.text = "" } label: {
                        Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.muted)
                    .accessibilityLabel("Clear \(title)")
                }
                if field.changed {
                    Button { field.revert() } label: {
                        Image(systemName: "arrow.uturn.backward.circle").font(.system(size: 20)).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                    .accessibilityLabel("Put back \(field.original.isEmpty ? "no date" : Format.day(field.original)) for \(title)")
                }
            }
            if field.changed, !field.original.isEmpty {
                Text("was \(Format.day(field.original))").font(.inter(11, relativeTo: .caption2)).foregroundStyle(Theme.muted).strikethrough()
            }
            if let error { Text(error).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.error) }
        }
        .padding(.vertical, 2)
    }
}

/// A read-only fact in an edit view, with the reason it is not editable.
struct FixedRow: View {
    let title: String
    let value: String
    var reason: String?

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack {
                Text(title).foregroundStyle(Theme.muted)
                Spacer(minLength: 8)
                Text(value).foregroundStyle(Theme.muted)
            }
            if let reason { Text(reason).font(.inter(11, relativeTo: .caption2)).foregroundStyle(Theme.muted) }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// A section title with an Edit action on its right. The action dims while the other section is being edited.
struct SectionTitle: View {
    let title: String
    var canEdit: Bool
    var onEdit: () -> Void

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Button("Edit", action: onEdit)
                .font(.inter(15, .semibold))
                .textCase(nil)
                .frame(minWidth: 44, minHeight: 44)
                .foregroundStyle(canEdit ? Theme.ink : Theme.muted.opacity(0.6))
                .disabled(!canEdit)
                .accessibilityLabel("Edit \(title.lowercased())")
        }
    }
}

/// Facts not recorded yet, as chips under "Add a detail". Tapping one adds its row.
struct AddDetailChips: View {
    let titles: [String]
    var onAdd: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Add a detail").font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
            FlowLayout(spacing: 6) {
                ForEach(titles.indices, id: \.self) { i in
                    Button { onAdd(i) } label: {
                        Text(titles[i])
                            .font(.inter(13, .medium))
                            .padding(.horizontal, 10).frame(minHeight: 44)
                            .overlay(Capsule().strokeBorder(Theme.muted, style: StrokeStyle(lineWidth: 1, dash: [3])))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.muted)
                    .accessibilityLabel("Add \(titles[i].lowercased())")
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Offered for a few seconds after a save. The only undo after saving: the old values are sent back.
struct UndoOffer: Identifiable {
    let id = UUID()
    let message: String
    let run: () async throws -> Void
}
