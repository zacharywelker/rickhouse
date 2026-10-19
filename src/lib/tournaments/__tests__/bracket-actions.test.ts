import { describe, expect, it } from "vitest";
import { canDraw, canMove, isOpen, nextPendingId, canPlay, canReset, canUndo, canWithdraw, flightControls, type ActionView } from "../bracket-actions";
import type { ViewHeat } from "../view";

const heat = (id: number, round: number, status: ViewHeat["status"], extra: Partial<ViewHeat> = {}): ViewHeat => ({
  id, round, slot: id, status, label: null, autoLabel: null, band: "", hidden: false, entryCount: 2, glasses: [], entries: [], ...extra,
});
const entries = [
  { id: 1, name: "A", status: "active" as const, kind: "bottle" as const, bottleId: 1, expressionId: 1 },
  { id: 2, name: "B", status: "withdrawn" as const, kind: "bottle" as const, bottleId: 2, expressionId: 2 },
];
const view = (status: ActionView["status"], rounds: ViewHeat[][], blind = false): ActionView => ({
  status, blind, entries,
  rounds: rounds.map((heats, i) => ({ round: i + 1, heats })),
  currentRound: rounds.length > 0 ? rounds.length : null,
});

describe("canPlay", () => {
  const v = view("active", [[heat(1, 1, "decided")], [heat(2, 2, "pending")]]);
  it("only a pending flight of the current round of a running tournament", () => {
    expect(canPlay(v, v.rounds[1]!.heats[0]!)).toBe(true);
    expect(canPlay(v, v.rounds[0]!.heats[0]!)).toBe(false);
    expect(canPlay(view("draft", [[heat(1, 1, "pending")]]), heat(1, 1, "pending"))).toBe(false);
    expect(canPlay(view("complete", [[heat(1, 1, "pending")]]), heat(1, 1, "pending"))).toBe(false);
  });
});

describe("canUndo", () => {
  it("a decided flight with no result after it", () => {
    const v = view("active", [[heat(1, 1, "decided")], [heat(2, 2, "pending")]]);
    expect(canUndo(v, v.rounds[0]!.heats[0]!)).toBe(true);
    expect(canUndo(v, v.rounds[1]!.heats[0]!)).toBe(false);
  });
  it("not when a later round has a result, nor for a bye or a draft", () => {
    const v = view("active", [[heat(1, 1, "decided"), heat(3, 1, "bye")], [heat(2, 2, "decided"), heat(4, 2, "pending")]]);
    expect(canUndo(v, v.rounds[0]!.heats[0]!)).toBe(false);
    expect(canUndo(v, v.rounds[1]!.heats[0]!)).toBe(true);
    expect(canUndo(v, v.rounds[0]!.heats[1]!)).toBe(false);
    expect(canUndo(view("draft", [[heat(1, 1, "decided")]]), heat(1, 1, "decided"))).toBe(false);
  });
  it("a finished tournament's final can be taken back", () => {
    const v = view("complete", [[heat(1, 1, "decided")]]);
    expect(canUndo(v, v.rounds[0]!.heats[0]!)).toBe(true);
  });
});

describe("canWithdraw", () => {
  const v = view("active", [[heat(1, 1, "pending"), heat(2, 1, "decided")]]);
  it("an active entry in an undecided flight of the current round", () => {
    expect(canWithdraw(v, v.rounds[0]!.heats[0]!, 1)).toBe(true);
    expect(canWithdraw(v, v.rounds[0]!.heats[0]!, 2)).toBe(false); // already withdrawn
    expect(canWithdraw(v, v.rounds[0]!.heats[1]!, 1)).toBe(false); // decided flight
  });
  it("never from a hidden flight, a draft or a finished tournament", () => {
    expect(canWithdraw(view("active", [[heat(1, 1, "pending", { hidden: true })]]), heat(1, 1, "pending", { hidden: true }), 1)).toBe(false);
    expect(canWithdraw(view("draft", [[heat(1, 1, "pending")]]), heat(1, 1, "pending"), 1)).toBe(false);
    expect(canWithdraw(view("complete", [[heat(1, 1, "pending")]]), heat(1, 1, "pending"), 1)).toBe(false);
  });
});

describe("canMove", () => {
  it("a draft's pending flights", () => {
    expect(canMove(view("draft", [[heat(1, 1, "pending")]]), heat(1, 1, "pending"))).toBe(true);
  });
  it("a running open tournament's pending flights of the current round only", () => {
    const v = view("active", [[heat(1, 1, "bye")], [heat(2, 2, "pending")]]);
    expect(canMove(v, v.rounds[1]!.heats[0]!)).toBe(true);
    expect(canMove(v, v.rounds[0]!.heats[0]!)).toBe(false);
  });
  it("a bye's lone bottle can move too, in a draft or the current round", () => {
    expect(canMove(view("draft", [[heat(1, 1, "bye")]]), heat(1, 1, "bye"))).toBe(true);
    expect(canMove(view("active", [[heat(1, 1, "bye"), heat(2, 1, "pending")]]), heat(1, 1, "bye"))).toBe(true);
    expect(isOpen(heat(1, 1, "decided"))).toBe(false);
  });
  it("not a running blind one, a hidden flight or a finished tournament", () => {
    expect(canMove(view("active", [[heat(1, 1, "pending")]], true), heat(1, 1, "pending"))).toBe(false);
    expect(canMove(view("active", [[heat(1, 1, "pending", { hidden: true })]]), heat(1, 1, "pending", { hidden: true }))).toBe(false);
    expect(canMove(view("complete", [[heat(1, 1, "pending")]]), heat(1, 1, "pending"))).toBe(false);
  });
});

describe("canReset", () => {
  it("a draft with two active entries; a running one with something undecided; never finished", () => {
    expect(canReset(view("draft", [[heat(1, 1, "pending")]]))).toBe(false); // one active entry
    expect(canReset({ ...view("draft", []), entries: [entries[0]!, { ...entries[0]!, id: 3 }] })).toBe(true);
    expect(canReset(view("active", [[heat(1, 1, "decided"), heat(2, 1, "pending")]]))).toBe(true);
    expect(canReset(view("active", [[heat(1, 1, "decided")]]))).toBe(false);
    expect(canReset(view("complete", [[heat(1, 1, "decided")]]))).toBe(false);
  });
});

describe("flightControls", () => {
  const e = (entryId: number) => ({ entryId, name: "x", place: null, glass: null, proof: null, mashbill: null, ageYears: null, distilleries: [] });
  it("lists what a pending flight of a running open tournament offers", () => {
    const h = heat(1, 1, "pending", { entries: [e(1), e(2)] });
    expect(flightControls(view("active", [[h]]), h)).toEqual({ play: true, undo: false, move: true, withdraw: [1] });
  });
  it("offers a hidden flight Play and nothing that names an entry", () => {
    const h = heat(1, 1, "pending", { hidden: true });
    expect(flightControls(view("active", [[h]], true), h)).toEqual({ play: true, undo: false, move: false, withdraw: [] });
  });
  it("offers a decided flight Undo only", () => {
    const h = heat(1, 1, "decided", { entries: [e(1)] });
    expect(flightControls(view("active", [[h]]), h)).toEqual({ play: false, undo: true, move: false, withdraw: [] });
  });
});

describe("canDraw", () => {
  it("a running blind tournament with a pending flight in the current round", () => {
    const pending = view("active", [[heat(1, 1, "decided"), heat(2, 1, "pending")]], true);
    expect(canDraw(pending)).toBe(true);
    expect(canDraw(view("active", [[heat(1, 1, "pending")]], false))).toBe(false);
    expect(canDraw(view("active", [[heat(1, 1, "decided")]], true))).toBe(false);
    expect(canDraw(view("draft", [[heat(1, 1, "pending")]], true))).toBe(false);
    expect(canDraw(view("complete", [[heat(1, 1, "decided")]], true))).toBe(false);
  });
});

describe("nextPendingId", () => {
  const v = view("active", [[heat(1, 1, "decided")], [heat(2, 2, "pending"), heat(3, 2, "decided"), heat(4, 2, "pending"), heat(5, 2, "pending")]]);
  it("the next pending flight after this slot, wrapping to the first, else null", () => {
    expect(nextPendingId(v, 2)).toBe(4);
    expect(nextPendingId(v, 4)).toBe(5);
    expect(nextPendingId(v, 5)).toBe(2);
    expect(nextPendingId(v, 3)).toBe(4);
    expect(nextPendingId(view("active", [[heat(1, 1, "decided"), heat(2, 1, "pending")]]), 2)).toBeNull();
  });
});
