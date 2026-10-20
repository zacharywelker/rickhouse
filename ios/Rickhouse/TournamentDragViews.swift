import SwiftUI
import UniformTypeIdentifiers

/// Drag and drop on the bracket (Detail and Compact layouts). The rules are `DragModel`'s; this file only carries a drag
/// from a row or a flight's grip to a drop zone and says, in words, what a drop would do.
///
/// Why `onDrag` / `DropDelegate` rather than `draggable` / `dropDestination`: the cue ("Full", "Swap") has to be shown while
/// the finger is still over a target, and only a delegate sees that moment with the payload in hand (the payload is
/// in-app state, `current`; the item that leaves the app is `{"bottle":{"entryId":…,"fromHeatId":…}}`, ids only, never a name).
@MainActor @Observable
final class DragCoordinator {
    /// The flight or bottle being dragged. Not observed: lifting must not redraw the view being lifted.
    @ObservationIgnored var current: Drag?
    /// The target under the finger; the one thing the views watch.
    var hover: DropTarget?
    @ObservationIgnored var view: () -> TournamentView? = { nil }
    @ObservationIgnored var busy: () -> Bool = { false }
    /// Runs a saved-able outcome; the screen sends it through the model and announces the result.
    @ObservationIgnored var perform: (DropOutcome, String?) -> Void = { _, _ in }

    func heat(_ id: Int) -> TournamentHeat? { view()?.rounds.flatMap(\.heats).first { $0.id == id } }

    func begin(_ drag: Drag) {
        current = drag
        hover = nil
    }

    /// A row is a swap target for a bottle and just part of its flight for a flight.
    func resolve(_ target: DropTarget) -> DropTarget {
        if case .bottle(_, let heatId) = target, case .flight? = current { return .flight(heatId: heatId) }
        return target
    }

    func outcome(_ target: DropTarget) -> DropOutcome? {
        guard let view = view(), let current else { return nil }
        return DragModel.dropOutcome(view, current, resolve(target))
    }

    /// Words for the target under the finger, nil elsewhere (and nil for "already here": dragging out of a flight is not an error).
    func cue(for target: DropTarget) -> String? {
        guard hover == resolve(target), let outcome = outcome(target) else { return nil }
        switch outcome {
        case .move: return "Move here"
        case .swap: return "Swap"
        case .reorder: return "Place here"
        case .none(let reason): return reason == .same ? nil : DragModel.refusalText(reason)
        }
    }

    func accepts(_ target: DropTarget) -> Bool {
        if busy() { return false }
        if case .none? = outcome(target) { return false }
        return outcome(target) != nil
    }

    func drop(_ target: DropTarget) -> Bool {
        defer { current = nil; hover = nil }
        guard let view = view(), let drag = current, !busy() else { return false }
        let outcome = DragModel.dropOutcome(view, drag, resolve(target))
        if case .none(let reason) = outcome {
            AccessibilityNotification.Announcement(DragModel.refusalText(reason)).post()
            return false
        }
        perform(outcome, DragModel.describeOutcome(view, outcome))
        return true
    }
}

private struct BracketDropDelegate: DropDelegate {
    let coordinator: DragCoordinator
    let target: DropTarget

    func validateDrop(info: DropInfo) -> Bool { coordinator.current != nil && info.hasItemsConforming(to: [.json]) }
    func dropEntered(info: DropInfo) { coordinator.hover = coordinator.resolve(target) }
    func dropUpdated(info: DropInfo) -> DropProposal? {
        if coordinator.hover != coordinator.resolve(target) { coordinator.hover = coordinator.resolve(target) }
        return DropProposal(operation: coordinator.accepts(target) ? .move : .forbidden)
    }
    func dropExited(info: DropInfo) { if coordinator.hover == coordinator.resolve(target) { coordinator.hover = nil } }
    func performDrop(info: DropInfo) -> Bool { coordinator.drop(target) }
}

private func provider(_ drag: Drag) -> NSItemProvider {
    let data = (try? JSONEncoder().encode(drag)) ?? Data()
    return NSItemProvider(item: data as NSData, typeIdentifier: UTType.json.identifier)
}

private struct CueBadge: View {
    let text: String
    var body: some View {
        Text(text).font(.inter(12, .semibold)).foregroundStyle(Theme.paper)
            .padding(.horizontal, 8).padding(.vertical, 4).background(Theme.ink, in: Capsule())
            .accessibilityHidden(true)
    }
}

/// A bottle's row: lift it to move or swap it; drop another bottle on it to swap.
private struct BottleDragModifier: ViewModifier {
    @Environment(DragCoordinator.self) private var drag: DragCoordinator?
    let entryId: Int, heatId: Int, name: String

    func body(content: Content) -> some View {
        if let drag, let view = drag.view(), let heat = drag.heat(heatId), DragModel.canDragBottle(view, heat) {
            content
                .onDrag({
                    drag.begin(.bottle(entryId: entryId, fromHeatId: heatId))
                    return provider(.bottle(entryId: entryId, fromHeatId: heatId))
                }, preview: {
                    Text(name).font(.inter(16, .medium)).foregroundStyle(Theme.ink).padding(12).background(Theme.paper)
                })
                .onDrop(of: [.json], delegate: BracketDropDelegate(coordinator: drag, target: .bottle(entryId: entryId, heatId: heatId)))
                // A row only speaks for itself while a bottle is over it; for a dragged flight the flight's own header says it.
                .overlay(alignment: .trailing) {
                    if case .bottle? = drag.current, let cue = drag.cue(for: .bottle(entryId: entryId, heatId: heatId)) { CueBadge(text: cue).padding(.trailing, 4) }
                }
                .accessibilityDragPoint(.center, description: Text("Lift \(name)"))
                .accessibilityDropPoint(.center, description: Text("Swap with \(name)"))
                .accessibilityHint("Drag to another flight, or use the actions.")
        } else {
            content
        }
    }
}

/// A flight's card: the drop zone for a bottle (move) and for another flight (take its place).
private struct FlightDropModifier: ViewModifier {
    @Environment(DragCoordinator.self) private var drag: DragCoordinator?
    let heatId: Int

    func body(content: Content) -> some View {
        if let drag, let view = drag.view(), let heat = drag.heat(heatId), DragModel.canDragBottle(view, heat) || DragModel.canDragFlight(view, heat) {
            let cue = drag.cue(for: .flight(heatId: heatId))
            content
                .onDrop(of: [.json], delegate: BracketDropDelegate(coordinator: drag, target: .flight(heatId: heatId)))
                .accessibilityDropPoint(.top, description: Text("Move here"))
                .overlay(alignment: .topTrailing) { if let cue { CueBadge(text: cue).padding(.top, 8) } }
                .overlay { if cue != nil { Rectangle().stroke(Theme.ink, lineWidth: 2).allowsHitTesting(false) } }
        } else {
            content
        }
    }
}

/// The grip on a flight's header: lift the flight to put it elsewhere in its round.
struct FlightGrip: View {
    @Environment(DragCoordinator.self) private var drag: DragCoordinator?
    let heatId: Int, title: String

    var body: some View {
        if let drag, let view = drag.view(), let heat = drag.heat(heatId), DragModel.canDragFlight(view, heat) {
            Image(systemName: "line.3.horizontal").font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.muted)
                .frame(width: 44, height: 44).contentShape(Rectangle())
                .onDrag({
                    drag.begin(.flight(heatId: heatId))
                    return provider(.flight(heatId: heatId))
                }, preview: {
                    Text(title).font(.inter(16, .semibold)).foregroundStyle(Theme.ink).padding(12).background(Theme.paper)
                })
                .accessibilityDragPoint(.center, description: Text("Lift \(title)"))
                .accessibilityLabel("Drag \(title)")
                .accessibilityHint("Or use the move flight buttons.")
        }
    }
}

/// The gap between two flights (index 0 before the first, n after the last): a flight dropped here goes to that place.
struct FlightGap: View {
    @Environment(DragCoordinator.self) private var drag: DragCoordinator?
    let index: Int
    let height: CGFloat

    var body: some View {
        let target = DropTarget.slot(index: index)
        let cue = drag?.cue(for: target)
        Color.clear.frame(height: height).contentShape(Rectangle())
            .overlay(alignment: .leading) {
                if let cue { HStack(spacing: 8) { Rectangle().fill(Theme.ink).frame(height: 3); CueBadge(text: cue) } }
            }
            .modifier(GapDrop(target: target))
    }
}

private struct GapDrop: ViewModifier {
    @Environment(DragCoordinator.self) private var drag: DragCoordinator?
    let target: DropTarget
    func body(content: Content) -> some View {
        if let drag { content.onDrop(of: [.json], delegate: BracketDropDelegate(coordinator: drag, target: target)) } else { content }
    }
}

extension View {
    func bottleDrag(entryId: Int, heatId: Int, name: String) -> some View { modifier(BottleDragModifier(entryId: entryId, heatId: heatId, name: name)) }
    func flightDrop(heatId: Int) -> some View { modifier(FlightDropModifier(heatId: heatId)) }
}
