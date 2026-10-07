import SwiftUI

/// Chips that wrap onto new lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// One flavor as a pill: filled when chosen.
struct FlavorChip: View {
    let label: String
    let selected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.inter(15, selected ? .semibold : .regular, relativeTo: .subheadline))
                .foregroundStyle(selected ? Theme.paper : Theme.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .background(selected ? Theme.ink : Color.clear, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.ink, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The flavors section of a tasting: what is chosen so far as pills (tap one to take it off), and a way into the wheel.
struct FlavorSection: View {
    @Environment(Session.self) private var session
    let wheel: TastingWheel
    @Binding var chosen: [String]

    var body: some View {
        Section {
            if !chosen.isEmpty {
                FlowLayout {
                    ForEach(chosen, id: \.self) { key in
                        FlavorChip(label: session.flavorName(key), selected: true) { chosen.removeAll { $0 == key } }
                            .accessibilityHint("Removes this flavor")
                    }
                }
                .padding(.vertical, 4)
            }
            NavigationLink {
                FlavorCategoriesScreen(wheel: wheel, chosen: $chosen)
            } label: {
                Text(chosen.isEmpty ? "Choose flavors" : "Add or change flavors")
            }
        } header: {
            Text("Flavors")
        } footer: {
            Text("From the \(wheel.credit).")
        }
    }
}

/// The wheel's categories, each with how many of its flavors are chosen.
struct FlavorCategoriesScreen: View {
    let wheel: TastingWheel
    @Binding var chosen: [String]

    var body: some View {
        List {
            ForEach(wheel.categories) { category in
                NavigationLink {
                    FlavorCategoryScreen(category: category, chosen: $chosen)
                } label: {
                    HStack {
                        Text(category.name).font(.inter(16, .medium))
                        Spacer()
                        let count = category.descriptors.filter { chosen.contains($0.key) }.count
                        if count > 0 {
                            Text("\(count)")
                                .font(.inter(13, .semibold)).monospacedDigit()
                                .foregroundStyle(Theme.paper)
                                .padding(.horizontal, 8).padding(.vertical, 2)
                                .background(Theme.ink, in: Capsule())
                                .accessibilityLabel("\(count) chosen")
                        }
                    }
                    .frame(minHeight: 44)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle(wheel.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One category's flavors, under its subcategories, to tap on and off.
struct FlavorCategoryScreen: View {
    let category: WheelCategory
    @Binding var chosen: [String]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ForEach(category.groups) { group in
                    VStack(alignment: .leading, spacing: 10) {
                        if let name = group.name {
                            Text(name).font(.inter(13, .semibold, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                        }
                        FlowLayout {
                            ForEach(group.descriptors) { descriptor in
                                FlavorChip(label: descriptor.label, selected: chosen.contains(descriptor.key)) {
                                    if let at = chosen.firstIndex(of: descriptor.key) {
                                        chosen.remove(at: at)
                                    } else {
                                        chosen.append(descriptor.key)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper)
        .navigationTitle(category.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
