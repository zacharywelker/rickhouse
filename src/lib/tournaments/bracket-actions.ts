import type { TournamentView, ViewHeat } from "./view";

/** What the controls of a flight or row depend on. */
export type ActionView = Pick<TournamentView, "status" | "blind" | "currentRound" | "rounds" | "entries">;

const isCurrent = (view: ActionView, heat: ViewHeat) => view.currentRound !== null && heat.round === view.currentRound;

/** Play: a pending flight of the current round of a running tournament. */
export function canPlay(view: ActionView, heat: ViewHeat): boolean {
  return view.status === "active" && heat.status === "pending" && isCurrent(view, heat);
}

/** Undo: a decided flight, while no flight of a later round has a result (the server's rule in `undoHeat`). */
export function canUndo(view: ActionView, heat: ViewHeat): boolean {
  if (view.status === "draft" || heat.status !== "decided") return false;
  return !view.rounds.some((r) => r.round > heat.round && r.heats.some((h) => h.status === "decided"));
}

/** Withdraw: an active entry of a running tournament, in a flight of the current round that is not decided. A hidden flight has no rows to ask it of. */
export function canWithdraw(view: ActionView, heat: ViewHeat, entryId: number): boolean {
  if (view.status !== "active" || heat.hidden || heat.status === "decided" || !isCurrent(view, heat)) return false;
  return view.entries.some((e) => e.id === entryId && e.status === "active");
}

/** Move and swap: a draft's flights, or a running open tournament's pending flights of the current round. Never a blind one (the server refuses). */
export function canMove(view: ActionView, heat: ViewHeat): boolean {
  if (heat.hidden || heat.status !== "pending") return false;
  if (view.status === "draft") return true;
  return view.status === "active" && !view.blind && isCurrent(view, heat);
}

/** Reset to automatic: regroup the undecided flights; a draft needs two entries, a running one something undecided; never when finished. */
export function canReset(view: ActionView): boolean {
  if (view.status === "complete") return false;
  if (view.status === "draft") return view.entries.filter((e) => e.status === "active").length >= 2;
  const current = view.rounds.find((r) => r.round === view.currentRound);
  return !!current && current.heats.some((h) => h.status !== "decided");
}

/** Everything one flight offers, worked out on the server so the client only draws what is allowed. */
export type FlightControls = { play: boolean; undo: boolean; move: boolean; withdraw: number[] };

export function flightControls(view: ActionView, heat: ViewHeat): FlightControls {
  return {
    play: canPlay(view, heat),
    undo: canUndo(view, heat),
    move: canMove(view, heat),
    withdraw: heat.entries.filter((e) => canWithdraw(view, heat, e.entryId)).map((e) => e.entryId),
  };
}

/** Draw a flight: a running blind tournament with a flight still to taste in the current round (the pourer's start). */
export function canDraw(view: ActionView): boolean {
  if (view.status !== "active" || !view.blind) return false;
  return view.rounds.some((r) => r.round === view.currentRound && r.heats.some((h) => h.status === "pending"));
}

/** The next pending flight of the current round after this one (by slot), else any other pending one, else null. */
export function nextPendingId(view: ActionView, heatId: number): number | null {
  const pending = view.rounds.filter((r) => r.round === view.currentRound).flatMap((r) => r.heats).filter((h) => h.status === "pending" && h.id !== heatId);
  const here = view.rounds.flatMap((r) => r.heats).find((h) => h.id === heatId);
  const after = here && here.round === view.currentRound ? pending.find((h) => h.slot > here.slot) : undefined;
  return (after ?? pending[0])?.id ?? null;
}
