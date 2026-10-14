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
    /// A row with a prefix is a price (the currency symbol): it changes in place, with no ↺ and no "was", which would
    /// resize the row as you type, and it stops at the cents.
    private var isMoney: Bool { prefix != nil }
    private var showsChange: Bool { tracksChanges && !isMoney && field.changed }

    /// A price's symbol has to sit against the amount, focused or not. A text field is as wide as it is offered, so the
    /// field is laid over an invisible copy of its own text, which is exactly as wide as the text needs.
    @ViewBuilder
    private func sized<Content: View>(_ content: Content) -> some View {
        if isMoney {
            Text((field.text.isEmpty ? (placeholder.isEmpty ? title : placeholder) : field.text) + " ")
                .hidden()
                .overlay(alignment: .trailing) { content }
        } else {
            content
        }
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(alignment: multiline ? .top : .firstTextBaseline, spacing: 8) {
                HStack(spacing: 6) {
                    if showsChange { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
                    Text(title).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 8)
                if let prefix, !field.isEmpty { Text(prefix).foregroundStyle(Theme.muted) }
                sized(TextField(placeholder.isEmpty ? title : placeholder, text: $field.text, axis: multiline ? .vertical : .horizontal)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(keyboard)
                    .focused($focused)
                    .foregroundStyle(error == nil ? Theme.ink : Theme.error)
                    .padding(.bottom, 1)
                    .overlay(alignment: .bottom) {
                        if focused || error != nil { Rectangle().fill(error == nil ? Theme.ink : Theme.error).frame(height: 2) }
                    }
                    .accessibilityLabel(title))
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
            // A price: stop at the cents rather than refuse the save.
            if isMoney { let clean = Format.moneyInput(text); if clean != text { field.text = clean } }
        }
    }
}

/// A date fact (12.2): "Add date" when there is none, else the date with a way to clear it. Never later than today.
struct DateRow: View {
    let title: String
    @Binding var field: Field
    var error: String?
    /// Off on a form for something new, where there is nothing to put back.
    var tracksChanges = true

    private var showsChange: Bool { tracksChanges && field.changed }

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
                    if showsChange { Circle().fill(Theme.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
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
                if showsChange {
                    Button { field.revert() } label: {
                        Image(systemName: "arrow.uturn.backward.circle").font(.system(size: 20)).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                    .accessibilityLabel("Put back \(field.original.isEmpty ? "no date" : Format.day(field.original)) for \(title)")
                }
            }
            if showsChange, !field.original.isEmpty {
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
            SectionLabel(title)
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

/// Offered for a few seconds after a save. The only undo after saving: the old values are sent back.
struct UndoOffer: Identifiable {
    let id = UUID()
    let message: String
    let run: () async throws -> Void
}
