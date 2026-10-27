import SwiftUI

/// Fill level is read as "about half", not 63%: the stored value stays a
/// percentage, but these six are what people set it with. Mirrors
/// src/lib/bottles/fill-state.ts on the server.
struct FillState: Identifiable, Equatable {
    let id: String
    let label: String
    let percent: Int

    static let all = [
        FillState(id: "full", label: "Full", percent: 100),
        FillState(id: "three-quarters", label: "¾", percent: 75),
        FillState(id: "half", label: "½", percent: 50),
        FillState(id: "quarter", label: "¼", percent: 25),
        FillState(id: "almost-gone", label: "Almost gone", percent: 10),
        FillState(id: "empty", label: "Empty", percent: 0),
    ]

    /// The state a stored percentage reads as. Bands meet halfway between the
    /// set-points, except that only a truly empty bottle is Empty.
    static func of(_ percent: Int) -> FillState {
        switch percent {
        case ..<1: all[5]
        case ..<18: all[4]
        case ..<38: all[3]
        case ..<63: all[2]
        case ..<88: all[1]
        default: all[0]
        }
    }

    /// The quick state a touch lands on, as an offset from the dial's hub (x right, y down). The dial detents
    /// like a real gauge rather than resting on 63%. Mirrors `pctFromDial` in src/lib/bottles/geometry.ts.
    static func percent(dx: Double, dy: Double) -> Int {
        // Below the hub there is no angle to read; stick to whichever peg is nearer.
        if dy > 0 { return dx < 0 ? 0 : 100 }
        // abs, not -dy: level with the hub dy is 0, and atan2(-0, -x) is -π, which would read the left peg as Full.
        let angle = atan2(abs(dy), dx) // 0 = right (Full), π = left (Empty)
        let raw = (Double.pi - angle) / Double.pi * 100
        return raw < 3 ? 0 : of(Int(raw)).percent
    }

    /// "¾ full", "Almost gone", "Empty": where a bare "¾" would be ambiguous.
    var text: String { ["three-quarters", "half", "quarter"].contains(id) ? "\(label) full" : label }

    /// For VoiceOver.
    var spoken: String {
        switch id {
        case "three-quarters": "Three quarters full"
        case "half": "Half full"
        case "quarter": "A quarter full"
        default: label
        }
    }
}

/// A fuel dial for the fill level: Empty at the left, Full at the right, the needle straight up at half.
/// Tap or drag anywhere on it; the needle detents onto the six states with a tick underfoot, and the level is
/// committed when the finger lifts. Same drawing as the web's FillGauge (src/components/bottles/fill-gauge.tsx),
/// in the app's ink and paper. `suffix` rides after the state's name in the readout ("· open").
struct FillPicker: View {
    let percent: Int
    var disabled = false
    var suffix = ""
    let onPick: (Int) -> Void

    @State private var dragPercent: Int?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var shown: Int { dragPercent ?? percent }

    var body: some View {
        let state = FillState.of(shown)
        VStack(spacing: 6) {
            GeometryReader { geo in
                dial(width: geo.size.width)
                    .contentShape(Rectangle())
                    .gesture(drag(width: geo.size.width))
            }
            .aspectRatio(DialShape.aspect, contentMode: .fit)
            .frame(maxWidth: 260)
            .opacity(disabled ? 0.5 : 1)
            .sensoryFeedback(.selection, trigger: shown)

            Text(state.text + suffix)
                .font(.inter(17, .medium))
                .foregroundStyle(Theme.ink)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fill level")
        .accessibilityValue(state.spoken)
        .accessibilityAdjustableAction { direction in
            guard !disabled, let at = FillState.all.firstIndex(of: state) else { return }
            // `all` runs Full to Empty, so "increment" walks toward the front.
            let next = direction == .increment ? at - 1 : at + 1
            if FillState.all.indices.contains(next) { onPick(FillState.all[next].percent) }
        }
    }

    private func dial(width: CGFloat) -> some View {
        let low = shown < 18
        return ZStack {
            DialShape.arc().stroke(Theme.ink.opacity(0.12), style: StrokeStyle(lineWidth: width * 0.085, lineCap: .butt))
            DialShape.arc()
                .trim(from: 0, to: CGFloat(shown) / 100)
                .stroke(low ? Theme.error : Theme.ink, style: StrokeStyle(lineWidth: width * 0.085, lineCap: .butt))
            ForEach(FillState.all) { option in
                let major = [0, 50, 100].contains(option.percent)
                DialShape.tick(at: option.percent, major: major)
                    .stroke(Theme.ink.opacity(0.6), style: StrokeStyle(lineWidth: width * (major ? 0.017 : 0.01), lineCap: .round))
            }
            Text("E").position(DialShape.point(0, radius: 1.0, width: width, dy: 0.125))
            Text("F").position(DialShape.point(100, radius: 1.0, width: width, dy: 0.125))
            DialShape.needle()
                .stroke(Theme.ink, style: StrokeStyle(lineWidth: width * 0.022, lineCap: .round))
                .rotationEffect(.degrees(Double(shown - 50) * 1.8), anchor: DialShape.hubAnchor)
            Circle().fill(Theme.ink).frame(width: width * 0.075, height: width * 0.075)
                .position(DialShape.point(50, radius: 0, width: width))
        }
        .font(.inter(12, .semibold))
        .foregroundStyle(Theme.muted)
        .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.55), value: shown)
    }

    private func drag(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard !disabled else { return }
                let hub = DialShape.point(50, radius: 0, width: width)
                dragPercent = FillState.percent(dx: value.location.x - hub.x, dy: value.location.y - hub.y)
            }
            .onEnded { _ in
                guard let picked = dragPercent else { return }
                if picked != percent { onPick(picked) }
                // After onPick's task has had its turn, so the needle doesn't jump back for a frame.
                DispatchQueue.main.async { dragPercent = nil }
            }
    }
}

/// The dial's drawing space is 120 x 72 with the hub at (60, 62) and a radius of 48, as on the web.
private enum DialShape {
    static let aspect: CGFloat = 120 / 72
    static let hubAnchor = UnitPoint(x: 0.5, y: 62.0 / 72.0)

    /// A point `pct` of the way round the dial, `radius` (1 = the sweep) out from the hub; `dy` nudges down in rect heights.
    static func point(_ pct: Int, radius: CGFloat, width: CGFloat, dy: CGFloat = 0) -> CGPoint {
        let k = width / 120
        let angle = Double.pi - Double(pct) / 100 * Double.pi
        return CGPoint(
            x: (60 + cos(angle) * 48 * radius) * k,
            y: (62 - sin(angle) * 48 * radius) * k + dy * width * 0.6
        )
    }

    /// The half circle, left to right over the top. Built from points rather than `addArc`, whose clockwise flag flips with the y axis.
    static func arc() -> some Shape {
        PointsShape { rect in
            (0...64).map { i in unit(Double(i) / 64 * 100, 1, in: rect) }
        }
    }

    static func tick(at pct: Int, major: Bool) -> some Shape {
        PointsShape { rect in
            [unit(Double(pct), 1 - 0.1, in: rect), unit(Double(pct), 1 - (major ? 0.2 : 0.14), in: rect)]
        }
    }

    static func needle() -> some Shape {
        PointsShape { rect in
            [unit(50, 0, in: rect), unit(50, 0.75, in: rect)]
        }
    }

    private static func unit(_ pct: Double, _ radius: Double, in rect: CGRect) -> CGPoint {
        let k = rect.width / 120
        let angle = Double.pi - pct / 100 * Double.pi
        return CGPoint(x: (60 + cos(angle) * 48 * radius) * k, y: (62 - sin(angle) * 48 * radius) * k)
    }
}

private struct PointsShape: Shape {
    let points: (CGRect) -> [CGPoint]

    func path(in rect: CGRect) -> Path {
        let pts = points(rect)
        var path = Path()
        guard let first = pts.first else { return path }
        path.move(to: first)
        for p in pts.dropFirst() { path.addLine(to: p) }
        return path
    }
}
