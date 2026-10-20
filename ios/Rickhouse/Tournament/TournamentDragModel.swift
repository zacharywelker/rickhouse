import Foundation

// Mirrors src/lib/tournaments/drag-model.ts: change both together.
// The rules are FlightActions' (canMove, isOpen, canReorder, flightSteps); this file only judges a drop.

/// What is being dragged. IDs only, never a name: this is what leaves the app if a drop lands somewhere else.
enum Drag: Codable, Equatable {
    case bottle(entryId: Int, fromHeatId: Int)
    case flight(heatId: Int)
}

enum DropTarget: Equatable {
    case flight(heatId: Int)
    case bottle(entryId: Int, heatId: Int)
    /// A gap between the flights of the round: 0 is before the first, n after the last.
    case slot(index: Int)
}

enum DropReason: Equatable { case same, full, closed, hidden, gone, unsupported }

enum DropOutcome: Equatable {
    case move(entryId: Int, toHeatId: Int)
    case swap(entryId: Int, withEntryId: Int)
    case reorder(heatId: Int, toSlot: Int)
    case none(DropReason)
}

enum DragModel {
    private static func findHeat(_ view: TournamentView, _ id: Int) -> TournamentHeat? {
        view.rounds.flatMap(\.heats).first { $0.id == id }
    }

    /// Can this flight be picked up? (undecided, current round or draft, not finished, never a hidden one)
    static func canDragFlight(_ view: TournamentView, _ heat: TournamentHeat) -> Bool { FlightActions.canReorder(view, heat) }

    /// Can this bottle be picked up? Same as the menu: a movable flight and a row of it.
    static func canDragBottle(_ view: TournamentView, _ heat: TournamentHeat) -> Bool { FlightActions.canMove(view, heat) }

    /// What dropping `drag` on `target` would do, or why nothing. The only place the drop rules live.
    static func dropOutcome(_ view: TournamentView, _ drag: Drag, _ target: DropTarget) -> DropOutcome {
        switch drag {
        case .flight(let heatId): return flightDrop(view, heatId, target)
        case .bottle(let entryId, let fromHeatId): return bottleDrop(view, entryId, fromHeatId, target)
        }
    }

    private static func bottleDrop(_ view: TournamentView, _ entryId: Int, _ fromHeatId: Int, _ target: DropTarget) -> DropOutcome {
        guard let from = findHeat(view, fromHeatId), from.entries.contains(where: { $0.entryId == entryId }) else { return .none(.gone) }
        if !FlightActions.canMove(view, from) { return .none(from.hidden ? .hidden : .closed) }
        let targetHeatId: Int
        switch target {
        case .slot: return .none(.unsupported)
        case .flight(let id): targetHeatId = id
        case .bottle(_, let id): targetHeatId = id
        }
        guard let to = findHeat(view, targetHeatId) else { return .none(.gone) }
        if to.hidden { return .none(.hidden) }
        if to.id == from.id { return .none(.same) }
        if to.round != from.round || !FlightActions.canMove(view, to) { return .none(.closed) }
        switch target {
        case .flight:
            return to.entryCount >= view.heatSize ? .none(.full) : .move(entryId: entryId, toHeatId: to.id)
        case .bottle(let other, _):
            if other == entryId { return .none(.same) }
            if !to.entries.contains(where: { $0.entryId == other }) { return .none(.gone) }
            return .swap(entryId: entryId, withEntryId: other)
        case .slot: return .none(.unsupported)
        }
    }

    private static func flightDrop(_ view: TournamentView, _ heatId: Int, _ target: DropTarget) -> DropOutcome {
        guard let heat = findHeat(view, heatId) else { return .none(.gone) }
        if heat.hidden { return .none(.hidden) }
        if !canDragFlight(view, heat) { return .none(.closed) }
        if case .bottle = target { return .none(.unsupported) }
        let round = (view.rounds.first { $0.round == heat.round }?.heats ?? []).sorted { $0.slot < $1.slot }
        let from = (round.firstIndex { $0.id == heat.id } ?? -1) + 1
        let toSlot: Int
        switch target {
        case .slot(let index):
            if index < 0 || index > round.count { return .none(.gone) }
            toSlot = index < from ? index + 1 : index // a gap after the flight counts the flight's own place
        case .flight(let id):
            guard let at = round.firstIndex(where: { $0.id == id }) else { return .none(.gone) }
            toSlot = at + 1
        case .bottle: return .none(.unsupported)
        }
        return toSlot == from ? .none(.same) : .reorder(heatId: heatId, toSlot: toSlot)
    }

    /// The words that say why a drop is refused ("Full"), for the cue on a target; colour is never the only signal.
    static func refusalText(_ reason: DropReason) -> String {
        switch reason {
        case .full: return "Full"
        case .same: return "Already here"
        case .hidden: return "Hidden"
        case .closed: return "Can't change"
        default: return "Can't drop here"
        }
    }

    /// The sentence a screen reader hears once a drop has been saved ("Moved B1 to Flight 3"); nil for a refused drop.
    static func describeOutcome(_ view: TournamentView, _ outcome: DropOutcome) -> String? {
        let heats = view.rounds.flatMap(\.heats)
        func nameOf(_ id: Int) -> String { heats.flatMap(\.entries).first { $0.entryId == id }?.name ?? "bottle" }
        func numberOf(_ heatId: Int) -> Int {
            guard let heat = heats.first(where: { $0.id == heatId }) else { return 0 }
            let round = (view.rounds.first { $0.round == heat.round }?.heats ?? []).sorted { $0.slot < $1.slot }
            return (round.firstIndex { $0.id == heatId } ?? -1) + 1
        }
        switch outcome {
        case .move(let e, let to): return "Moved \(nameOf(e)) to Flight \(numberOf(to))"
        case .swap(let e, let w): return "Swapped \(nameOf(e)) with \(nameOf(w))"
        case .reorder(let h, let slot): return "Moved flight \(numberOf(h)) to position \(slot)"
        case .none: return nil
        }
    }
}
