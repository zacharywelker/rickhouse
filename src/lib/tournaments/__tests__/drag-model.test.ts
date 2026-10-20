import { describe, expect, it } from "vitest";
import { canDragFlight, flightSteps, describeOutcome, dropOutcome, refusalText, type DragView } from "../drag-model";
import type { ViewHeat, ViewHeatEntry } from "../view";

const ent = (id: number): ViewHeatEntry => ({ entryId: id, name: `B${id}`, proof: 100 } as ViewHeatEntry);
const heat = (id: number, round: number, slot: number, status: ViewHeat["status"], ids: number[], extra: Partial<ViewHeat> = {}): ViewHeat => ({
  id, round, slot, status, label: null, autoLabel: null, band: "", hidden: false, entryCount: ids.length, glasses: [], entries: ids.map(ent), ...extra,
});
const mk = (status: DragView["status"], heats: ViewHeat[], extra: Partial<DragView> = {}): DragView => ({
  status, blind: false, heatSize: 3, currentRound: 1, rounds: [{ round: 1, heats }], ...extra,
});
// flight 1: 1,2,3 (full); flight 2: 4,5; flight 3: 6 (bye)
const draft = () => mk("draft", [heat(1, 1, 1, "pending", [1, 2, 3]), heat(2, 1, 2, "pending", [4, 5]), heat(3, 1, 3, "bye", [6])]);
const b = (entryId: number, fromHeatId: number) => ({ kind: "bottle" as const, entryId, fromHeatId });
const none = (reason: string) => ({ kind: "none", reason });

describe("a bottle dropped on a flight", () => {
  it("moves into a flight with room, including a lone-bottle flight", () => {
    expect(dropOutcome(draft(), b(1, 1), { kind: "flight", heatId: 2 })).toEqual({ kind: "move", entryId: 1, toHeatId: 2 });
    expect(dropOutcome(draft(), b(1, 1), { kind: "flight", heatId: 3 })).toEqual({ kind: "move", entryId: 1, toHeatId: 3 });
  });
  it("is refused for a full flight, its own flight, or a missing one", () => {
    expect(dropOutcome(draft(), b(4, 2), { kind: "flight", heatId: 1 })).toEqual(none("full"));
    expect(dropOutcome(draft(), b(4, 2), { kind: "flight", heatId: 2 })).toEqual(none("same"));
    expect(dropOutcome(draft(), b(4, 2), { kind: "flight", heatId: 99 })).toEqual(none("gone"));
  });
  it("is refused when the bottle is not in the flight it claims", () => {
    expect(dropOutcome(draft(), b(9, 2), { kind: "flight", heatId: 3 })).toEqual(none("gone"));
    expect(dropOutcome(draft(), b(4, 99), { kind: "flight", heatId: 3 })).toEqual(none("gone"));
  });
  it("never onto a gap", () => {
    expect(dropOutcome(draft(), b(4, 2), { kind: "slot", index: 0 })).toEqual(none("unsupported"));
  });
});

describe("a bottle dropped on a bottle", () => {
  it("swaps with a bottle of another open flight, even when it is full", () => {
    expect(dropOutcome(draft(), b(4, 2), { kind: "bottle", entryId: 1, heatId: 1 })).toEqual({ kind: "swap", entryId: 4, withEntryId: 1 });
    expect(dropOutcome(draft(), b(6, 3), { kind: "bottle", entryId: 1, heatId: 1 })).toEqual({ kind: "swap", entryId: 6, withEntryId: 1 });
  });
  it("not with itself or a bottle of its own flight", () => {
    expect(dropOutcome(draft(), b(4, 2), { kind: "bottle", entryId: 4, heatId: 2 })).toEqual(none("same"));
    expect(dropOutcome(draft(), b(4, 2), { kind: "bottle", entryId: 5, heatId: 2 })).toEqual(none("same"));
  });
  it("not with a bottle that is not where the target says", () => {
    expect(dropOutcome(draft(), b(4, 2), { kind: "bottle", entryId: 6, heatId: 1 })).toEqual(none("gone"));
  });
});

describe("closed flights", () => {
  const v = mk("active", [heat(1, 1, 1, "decided", [1, 2]), heat(2, 1, 2, "pending", [3, 4]), heat(3, 1, 3, "pending", [5], { })]);
  it("a decided flight neither gives nor takes a bottle", () => {
    expect(dropOutcome(v, b(1, 1), { kind: "flight", heatId: 2 })).toEqual(none("closed"));
    expect(dropOutcome(v, b(3, 2), { kind: "flight", heatId: 1 })).toEqual(none("closed"));
    expect(dropOutcome(v, b(3, 2), { kind: "bottle", entryId: 1, heatId: 1 })).toEqual(none("closed"));
  });
  it("running, non-blind, current round: moves and swaps work", () => {
    expect(dropOutcome(v, b(3, 2), { kind: "flight", heatId: 3 })).toEqual({ kind: "move", entryId: 3, toHeatId: 3 });
    expect(dropOutcome(v, b(3, 2), { kind: "bottle", entryId: 5, heatId: 3 })).toEqual({ kind: "swap", entryId: 3, withEntryId: 5 });
  });
  it("a finished tournament offers nothing", () => {
    const done = mk("complete", [heat(1, 1, 1, "pending", [1, 2]), heat(2, 1, 2, "pending", [3])]);
    expect(dropOutcome(done, b(1, 1), { kind: "flight", heatId: 2 })).toEqual(none("closed"));
    expect(dropOutcome(done, { kind: "flight", heatId: 1 }, { kind: "slot", index: 2 })).toEqual(none("closed"));
  });
  it("an earlier round is closed", () => {
    const two = mk("active", [heat(1, 1, 1, "pending", [1, 2])], { currentRound: 2, rounds: [{ round: 1, heats: [heat(1, 1, 1, "pending", [1, 2]), heat(2, 1, 2, "pending", [3])] }, { round: 2, heats: [heat(4, 2, 1, "pending", [1, 3])] }] });
    expect(dropOutcome(two, b(1, 1), { kind: "flight", heatId: 2 })).toEqual(none("closed"));
  });
  it("a blind running tournament: nothing moves, a hidden flight is never a target or a source", () => {
    const blind = mk("active", [heat(1, 1, 1, "pending", [], { hidden: true, entryCount: 2 }), heat(2, 1, 2, "pending", [3])], { blind: true });
    expect(dropOutcome(blind, b(3, 2), { kind: "flight", heatId: 1 })).toEqual(none("closed"));
    expect(dropOutcome(blind, b(3, 2), { kind: "bottle", entryId: 5, heatId: 1 })).toEqual(none("closed"));
    expect(dropOutcome(blind, { kind: "flight", heatId: 1 }, { kind: "slot", index: 2 })).toEqual(none("hidden"));
  });
  it("a hidden flight as target of an otherwise movable bottle (non-blind data, defensive)", () => {
    const v = mk("draft", [heat(1, 1, 1, "pending", [], { hidden: true, entryCount: 2 }), heat(2, 1, 2, "pending", [3])]);
    expect(dropOutcome(v, b(3, 2), { kind: "flight", heatId: 1 })).toEqual(none("hidden"));
    expect(dropOutcome(v, b(3, 2), { kind: "bottle", entryId: 5, heatId: 1 })).toEqual(none("hidden"));
  });
  it("a blind draft is open (nothing is hidden before it runs)", () => {
    const d = mk("draft", [heat(1, 1, 1, "pending", [1, 2]), heat(2, 1, 2, "pending", [3])], { blind: true });
    expect(dropOutcome(d, b(3, 2), { kind: "flight", heatId: 1 })).toEqual({ kind: "move", entryId: 3, toHeatId: 1 });
  });
});

describe("a flight dragged", () => {
  const f = (heatId: number) => ({ kind: "flight" as const, heatId });
  it("onto a gap: the place it will have afterwards", () => {
    expect(dropOutcome(draft(), f(3), { kind: "slot", index: 0 })).toEqual({ kind: "reorder", heatId: 3, toSlot: 1 });
    expect(dropOutcome(draft(), f(1), { kind: "slot", index: 3 })).toEqual({ kind: "reorder", heatId: 1, toSlot: 3 });
    expect(dropOutcome(draft(), f(1), { kind: "slot", index: 2 })).toEqual({ kind: "reorder", heatId: 1, toSlot: 2 });
    expect(dropOutcome(draft(), f(3), { kind: "slot", index: 1 })).toEqual({ kind: "reorder", heatId: 3, toSlot: 2 });
  });
  it("onto the gaps beside itself: nothing", () => {
    expect(dropOutcome(draft(), f(2), { kind: "slot", index: 1 })).toEqual(none("same"));
    expect(dropOutcome(draft(), f(2), { kind: "slot", index: 2 })).toEqual(none("same"));
  });
  it("onto another flight: takes that flight's place", () => {
    expect(dropOutcome(draft(), f(1), { kind: "flight", heatId: 3 })).toEqual({ kind: "reorder", heatId: 1, toSlot: 3 });
    expect(dropOutcome(draft(), f(3), { kind: "flight", heatId: 1 })).toEqual({ kind: "reorder", heatId: 3, toSlot: 1 });
    expect(dropOutcome(draft(), f(2), { kind: "flight", heatId: 2 })).toEqual(none("same"));
  });
  it("gaps out of range or a missing flight: nothing", () => {
    expect(dropOutcome(draft(), f(1), { kind: "slot", index: -1 })).toEqual(none("gone"));
    expect(dropOutcome(draft(), f(1), { kind: "slot", index: 4 })).toEqual(none("gone"));
    expect(dropOutcome(draft(), f(99), { kind: "slot", index: 1 })).toEqual(none("gone"));
    expect(dropOutcome(draft(), f(1), { kind: "flight", heatId: 99 })).toEqual(none("gone"));
  });
  it("never onto a bottle", () => {
    expect(dropOutcome(draft(), f(1), { kind: "bottle", entryId: 4, heatId: 2 })).toEqual(none("unsupported"));
  });
  it("slots are read in slot order, gaps in numbering included", () => {
    const v = mk("draft", [heat(1, 1, 7, "pending", [1, 2]), heat(2, 1, 3, "pending", [3, 4]), heat(3, 1, 9, "pending", [5, 6])]);
    expect(dropOutcome(v, { kind: "flight", heatId: 3 }, { kind: "slot", index: 0 })).toEqual({ kind: "reorder", heatId: 3, toSlot: 1 });
  });
  it("a running current round yes (even blind, if not hidden); decided and earlier rounds no", () => {
    const v = mk("active", [heat(1, 1, 1, "decided", [1, 2]), heat(2, 1, 2, "pending", [3, 4]), heat(3, 1, 3, "pending", [5, 6])], { blind: false });
    expect(dropOutcome(v, f(3), { kind: "slot", index: 0 })).toEqual({ kind: "reorder", heatId: 3, toSlot: 1 });
    expect(dropOutcome(v, f(1), { kind: "slot", index: 2 })).toEqual(none("closed"));
    expect(canDragFlight(v, v.rounds[0]!.heats[0]!)).toBe(false);
    expect(canDragFlight(v, v.rounds[0]!.heats[1]!)).toBe(true);
  });
});

describe("refusalText", () => {
  it("has words for every reason", () => {
    expect(refusalText("full")).toBe("Full");
    expect(refusalText("same")).toBe("Already here");
    expect(refusalText("unsupported")).toBe("Can't drop here");
  });
});

describe("describeOutcome", () => {
  it("names what happened, with the flight number it had before and the places for a reorder", () => {
    const v = draft();
    expect(describeOutcome(v, { kind: "move", entryId: 1, toHeatId: 2 })).toBe("Moved B1 to Flight 2");
    expect(describeOutcome(v, { kind: "swap", entryId: 4, withEntryId: 1 })).toBe("Swapped B4 with B1");
    expect(describeOutcome(v, { kind: "reorder", heatId: 3, toSlot: 1 })).toBe("Moved flight 3 to position 1");
    expect(describeOutcome(v, { kind: "none", reason: "full" })).toBeNull();
  });
});

describe("flightSteps (the buttons that stand in for dragging a flight)", () => {
  const at = (v: DragView, i: number) => flightSteps(v, v.rounds[0]!.heats[i]!);
  it("offers up and down, none past either end", () => {
    const v = draft();
    expect(at(v, 0)).toEqual({ place: 1, of: 3, up: null, down: 2 });
    expect(at(v, 1)).toEqual({ place: 2, of: 3, up: 1, down: 3 });
    expect(at(v, 2)).toEqual({ place: 3, of: 3, up: 2, down: null });
  });
  it("counts the place by slot order, gaps or not", () => {
    const v = mk("draft", [heat(7, 1, 9, "pending", [1, 2]), heat(8, 1, 3, "pending", [3, 4])]);
    expect(at(v, 0)).toEqual({ place: 2, of: 2, up: 1, down: null });
  });
  it("none for a lone flight, a decided flight, a hidden flight, an earlier round or a finished tournament", () => {
    expect(at(mk("draft", [heat(1, 1, 1, "pending", [1, 2])]), 0)).toBeNull();
    const running = mk("active", [heat(1, 1, 1, "decided", [1, 2]), heat(2, 1, 2, "pending", [3, 4]), heat(3, 1, 3, "pending", [5, 6], { hidden: true })]);
    expect(at(running, 0)).toBeNull();
    expect(at(running, 1)).toEqual({ place: 2, of: 3, up: 1, down: 3 });
    expect(at(running, 2)).toBeNull();
    expect(at(mk("complete", [heat(1, 1, 1, "pending", [1, 2]), heat(2, 1, 2, "pending", [3, 4])]), 0)).toBeNull();
    expect(at(mk("active", [heat(1, 1, 1, "pending", [1, 2]), heat(2, 1, 2, "pending", [3, 4])], { currentRound: 2 }), 0)).toBeNull();
  });
});
