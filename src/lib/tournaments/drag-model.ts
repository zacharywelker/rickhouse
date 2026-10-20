import { canMove, isOpen, type ActionView } from "./bracket-actions";
import type { TournamentView, ViewHeat } from "./view";

/** What a drop is judged against: the rules of the menu (`canMove`) plus how big a flight may be. */
export type DragView = Pick<ActionView, "status" | "blind" | "currentRound" | "rounds"> & Pick<TournamentView, "heatSize">;

export type Drag = { kind: "bottle"; entryId: number; fromHeatId: number } | { kind: "flight"; heatId: number };
export type DropTarget =
  | { kind: "flight"; heatId: number }
  | { kind: "bottle"; entryId: number; heatId: number }
  /** A gap between the flights of the round: 0 is before the first, n after the last. */
  | { kind: "slot"; index: number };

export type DropReason = "same" | "full" | "closed" | "hidden" | "gone" | "unsupported";
export type DropOutcome =
  | { kind: "move"; entryId: number; toHeatId: number }
  | { kind: "swap"; entryId: number; withEntryId: number }
  | { kind: "reorder"; heatId: number; toSlot: number }
  | { kind: "none"; reason: DropReason };

const none = (reason: DropReason): DropOutcome => ({ kind: "none", reason });
const findHeat = (view: DragView, id: number): ViewHeat | undefined => view.rounds.flatMap((r) => r.heats).find((h) => h.id === id);

/** Can this flight be picked up? (the server's rule for `moveHeat`: undecided, current round, not finished; never a hidden one here.) */
export function canDragFlight(view: DragView, heat: ViewHeat): boolean {
  if (heat.hidden || !isOpen(heat) || view.status === "complete") return false;
  return view.status === "draft" || (view.currentRound !== null && heat.round === view.currentRound);
}

/**
 * The button alternative to dragging a flight: the place one step up and one step down, or null where the flight cannot
 * go (first, last, or not movable at all). `place` is the flight's own position in its round.
 */
export function flightSteps(view: DragView, heat: ViewHeat): { place: number; of: number; up: number | null; down: number | null } | null {
  if (!canDragFlight(view, heat)) return null;
  const round = view.rounds.find((r) => r.round === heat.round)?.heats ?? [];
  const of = round.length;
  const place = round.filter((h) => h.slot < heat.slot).length + 1;
  if (of < 2) return null;
  return { place, of, up: place > 1 ? place - 1 : null, down: place < of ? place + 1 : null };
}

/** Can this bottle be picked up? Same as the menu: a movable flight and a row of it. */
export const canDragBottle = (view: DragView, heat: ViewHeat): boolean => canMove(view, heat);

/** What dropping `drag` on `target` would do, or why nothing. The only place the drop rules live. */
export function dropOutcome(view: DragView, drag: Drag, target: DropTarget): DropOutcome {
  if (drag.kind === "flight") return flightDrop(view, drag.heatId, target);
  const from = findHeat(view, drag.fromHeatId);
  if (!from || !from.entries.some((e) => e.entryId === drag.entryId)) return none("gone");
  if (!canMove(view, from)) return none(from.hidden ? "hidden" : "closed");
  if (target.kind === "slot") return none("unsupported");
  const to = findHeat(view, target.heatId);
  if (!to) return none("gone");
  if (to.hidden) return none("hidden");
  if (to.id === from.id) return none("same");
  if (to.round !== from.round || !canMove(view, to)) return none("closed");
  if (target.kind === "flight") return to.entryCount >= view.heatSize ? none("full") : { kind: "move", entryId: drag.entryId, toHeatId: to.id };
  if (target.entryId === drag.entryId) return none("same");
  if (!to.entries.some((e) => e.entryId === target.entryId)) return none("gone");
  return { kind: "swap", entryId: drag.entryId, withEntryId: target.entryId };
}

function flightDrop(view: DragView, heatId: number, target: DropTarget): DropOutcome {
  const heat = findHeat(view, heatId);
  if (!heat) return none("gone");
  if (heat.hidden) return none("hidden");
  if (!canDragFlight(view, heat)) return none("closed");
  if (target.kind === "bottle") return none("unsupported");
  const round = (view.rounds.find((r) => r.round === heat.round)?.heats ?? []).slice().sort((a, b) => a.slot - b.slot);
  const from = round.findIndex((h) => h.id === heat.id) + 1;
  let toSlot: number;
  if (target.kind === "slot") {
    if (!Number.isInteger(target.index) || target.index < 0 || target.index > round.length) return none("gone");
    toSlot = target.index < from ? target.index + 1 : target.index; // a gap after the flight counts the flight's own place
  } else {
    const at = round.findIndex((h) => h.id === target.heatId) + 1;
    if (at === 0) return none("gone");
    toSlot = at;
  }
  return toSlot === from ? none("same") : { kind: "reorder", heatId, toSlot };
}

/** The words that say why a drop is refused ("Full"), for the cue on a target; colour is never the only signal. */
export function refusalText(reason: DropReason): string {
  switch (reason) {
    case "full":
      return "Full";
    case "same":
      return "Already here";
    case "hidden":
      return "Hidden";
    case "closed":
      return "Can't change";
    default:
      return "Can't drop here";
  }
}

/** The sentence a screen reader hears once a drop has been saved ("Moved B1 to Flight 3"); null for a refused drop. */
export function describeOutcome(view: DragView, outcome: DropOutcome): string | null {
  const heats = view.rounds.flatMap((r) => r.heats);
  const nameOf = (id: number) => heats.flatMap((h) => h.entries).find((e) => e.entryId === id)?.name ?? "bottle";
  const numberOf = (heatId: number) => {
    const heat = heats.find((h) => h.id === heatId);
    const round = view.rounds.find((r) => r.round === heat?.round)?.heats ?? [];
    return round.slice().sort((a, b) => a.slot - b.slot).findIndex((h) => h.id === heatId) + 1;
  };
  switch (outcome.kind) {
    case "move":
      return `Moved ${nameOf(outcome.entryId)} to Flight ${numberOf(outcome.toHeatId)}`;
    case "swap":
      return `Swapped ${nameOf(outcome.entryId)} with ${nameOf(outcome.withEntryId)}`;
    case "reorder":
      return `Moved flight ${numberOf(outcome.heatId)} to position ${outcome.toSlot}`;
    default:
      return null;
  }
}
