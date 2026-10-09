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
    /// What is being tasted, shown at the top of the wheel screen.
    var subject: String?
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
                FlavorWheelScreen(wheel: wheel, subject: subject, chosen: $chosen)
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

/// One slice of the wheel ring.
private struct WheelSlice: Shape {
    var index: Int
    var count: Int
    var innerRatio: CGFloat

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2
        let inner = outer * innerRatio
        // Starts at the top and runs clockwise; a hair is left between neighbours.
        let step = 360.0 / Double(count)
        let start = Angle.degrees(-90 + step * Double(index) + 0.6)
        let end = Angle.degrees(-90 + step * Double(index + 1) - 0.6)
        var p = Path()
        p.addArc(center: center, radius: outer, startAngle: start, endAngle: end, clockwise: false)
        p.addArc(center: center, radius: inner, startAngle: end, endAngle: start, clockwise: true)
        p.closeSubpath()
        return p
    }
}

/// The wheel as a picture of its categories. Tapping a slice chooses a category, never a flavor: the bourbon wheel has
/// sixteen categories and over two hundred flavors, too small to tap. The flavors of the chosen category are the chips
/// under it.
struct FlavorWheelScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session
    let wheel: TastingWheel
    var subject: String?
    @Binding var chosen: [String]

    @State private var selectedId: String?

    /// Slice colours cycle through these; the colour only tells neighbours apart. The category's name is printed in the
    /// middle, and the chosen slice is drawn with a heavy outline, so colour is never the only cue.
    private static let hues: [Color] = [
        Color(hex: 0xF7EA48), Color(hex: 0xFC9350), Color(hex: 0xF4633A), Color(hex: 0x9678D3),
        Color(hex: 0x48D597), Color(hex: 0x56B7E6), Color(hex: 0xEF426F), Color(hex: 0xA6DD45),
    ]
    private static let innerRatio: CGFloat = 0.42

    private var selected: WheelCategory? {
        wheel.categories.first { $0.id == selectedId } ?? wheel.categories.first { c in c.descriptors.contains { chosen.contains($0.key) } } ?? wheel.categories.first
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let subject {
                    Text(subject).font(.inter(14, .semibold, relativeTo: .subheadline)).foregroundStyle(Theme.ink)
                }
                ring
                    .frame(maxWidth: .infinity)
                Text("Tap a slice, then pick flavors below.")
                    .font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity)
                if let selected { descriptors(of: selected) }
                if !chosen.isEmpty { pickedList }
            }
            .padding(16)
        }
        .background(Theme.paper)
        .navigationTitle(wheel.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }

    private var ring: some View {
        let count = wheel.categories.count
        let current = selected
        return GeometryReader { geo in
            let side = min(geo.size.width, 300)
            ZStack {
                ForEach(Array(wheel.categories.enumerated()), id: \.element.id) { index, category in
                    let isSelected = category.id == current?.id
                    WheelSlice(index: index, count: count, innerRatio: Self.innerRatio)
                        .fill(Self.hues[index % Self.hues.count])
                        .overlay(WheelSlice(index: index, count: count, innerRatio: Self.innerRatio)
                            .stroke(Theme.ink, lineWidth: isSelected ? 3 : 1))
                        .scaleEffect(isSelected ? 1.0 : 0.97)
                        .zIndex(isSelected ? 1 : 0)
                }
                ForEach(Array(wheel.categories.enumerated()), id: \.element.id) { index, category in
                    sliceLabel(category.name, index: index, count: count, side: side)
                }
                VStack(spacing: 2) {
                    Text(current?.name ?? "").font(.headline(18)).foregroundStyle(Theme.ink).multilineTextAlignment(.center)
                    if let current {
                        let n = current.descriptors.filter { chosen.contains($0.key) }.count
                        Text(n == 0 ? "none picked" : "\(n) picked").font(.inter(11, .medium, relativeTo: .caption2)).foregroundStyle(Theme.muted)
                    }
                }
                .frame(width: side * Self.innerRatio * 1.7)
            }
            .frame(width: side, height: side)
            .contentShape(Circle())
            .gesture(DragGesture(minimumDistance: 0).onEnded { drag in
                if let hit = category(at: drag.location, side: side, count: count) { selectedId = hit.id }
            })
            .frame(maxWidth: .infinity)
            // Slices can't be reached one by one with VoiceOver, so it gets a menu of the categories instead.
            .accessibilityRepresentation {
                Picker("Category", selection: Binding(get: { current?.id ?? "" }, set: { selectedId = $0 })) {
                    ForEach(wheel.categories) { Text($0.name).tag($0.id) }
                }
            }
        }
        .frame(height: 300)
    }

    /// A category's name along its slice's middle, running outward and turned so it never reads upside down.
    private func sliceLabel(_ name: String, index: Int, count: Int, side: CGFloat) -> some View {
        let outer = side / 2
        let degrees = -90 + 360 / Double(count) * (Double(index) + 0.5)
        let mid = outer * (1 + Self.innerRatio) / 2
        let radians = degrees * .pi / 180
        let flip = cos(radians) < 0
        return Text(name)
            .font(.inter(10, .semibold, relativeTo: .caption2))
            .foregroundStyle(Theme.ink)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.7)
            .frame(width: outer * (1 - Self.innerRatio) - 8)
            .rotationEffect(.degrees(flip ? degrees + 180 : degrees))
            .offset(x: mid * cos(radians), y: mid * sin(radians))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    /// The category under a point in the ring, nil in the hole or outside.
    private func category(at point: CGPoint, side: CGFloat, count: Int) -> WheelCategory? {
        let dx = point.x - side / 2, dy = point.y - side / 2
        let radius = (dx * dx + dy * dy).squareRoot()
        guard radius <= side / 2, radius >= side / 2 * Self.innerRatio else { return nil }
        // Clockwise from the top.
        var degrees = atan2(dy, dx) * 180 / .pi + 90
        if degrees < 0 { degrees += 360 }
        let index = min(count - 1, Int(degrees / (360 / Double(count))))
        return wheel.categories[index]
    }

    private func descriptors(of category: WheelCategory) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(category.groups) { group in
                VStack(alignment: .leading, spacing: 8) {
                    if let name = group.name {
                        Text(name).font(.inter(13, .semibold, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                    }
                    FlowLayout {
                        ForEach(group.descriptors) { descriptor in
                            FlavorChip(label: descriptor.label, selected: chosen.contains(descriptor.key)) { toggle(descriptor.key) }
                        }
                    }
                }
            }
        }
    }

    private var pickedList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(Theme.ink.opacity(0.15)).frame(height: 1)
            Text("Picked")
                .font(.inter(12, .semibold, relativeTo: .caption)).textCase(.uppercase).tracking(0.8).foregroundStyle(Theme.muted)
            Text(chosen.map(session.flavorName).joined(separator: ", "))
                .font(.inter(14, .medium, relativeTo: .subheadline)).foregroundStyle(Theme.ink)
        }
    }

    private func toggle(_ key: String) {
        if let at = chosen.firstIndex(of: key) { chosen.remove(at: at) } else { chosen.append(key) }
    }
}
