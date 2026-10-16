import { describe, expect, it } from "vitest";
import {
  MAX_ENTRIES,
  chosenAmong,
  counts,
  emptyField,
  entryKey,
  fieldReducer,
  toEntryInputs,
  type FieldState,
  type PickedBottle,
} from "../field-selection";

const bottle = (n: number): PickedBottle => ({ kind: "bottle", bottleId: n, expressionId: 100 + n, name: `Bottle ${n}` });
const label = (n: number) => ({ expressionId: n, name: `Label ${n}` });
const run = (state: FieldState, ...actions: Parameters<typeof fieldReducer>[1][]) => actions.reduce(fieldReducer, state);

describe("fieldReducer", () => {
  it("toggles a bottle on and off", () => {
    const on = run(emptyField, { type: "toggleBottle", bottle: bottle(1) });
    expect(on.entries).toEqual([bottle(1)]);
    expect(run(on, { type: "toggleBottle", bottle: bottle(1) }).entries).toEqual([]);
  });

  it("selects every shown bottle once, keeping the order picked", () => {
    const state = run(emptyField, { type: "toggleBottle", bottle: bottle(2) }, { type: "selectAll", bottles: [bottle(1), bottle(2), bottle(3)] });
    expect(state.entries.map((e) => e.kind === "bottle" && e.bottleId)).toEqual([2, 1, 3]);
  });

  it("clears everything and removes one entry by key", () => {
    const state = run(emptyField, { type: "selectAll", bottles: [bottle(1), bottle(2)] });
    expect(run(state, { type: "remove", key: entryKey(bottle(1)) }).entries).toEqual([bottle(2)]);
    expect(run(state, { type: "clear" }).entries).toEqual([]);
  });

  it("adds a label once, and still allows a label whose bottle is already picked", () => {
    const state = run(emptyField, { type: "toggleBottle", bottle: bottle(5) }, { type: "addLabel", label: { expressionId: 105, name: "Bottle 5's label" } });
    expect(state.entries).toHaveLength(2);
    const again = run(state, { type: "addLabel", label: { expressionId: 105, name: "Bottle 5's label" } });
    expect(again.entries).toHaveLength(2);
    expect(again.notice).toMatch(/already/i);
  });

  it("adds an outside entry trimmed, ignores blanks and case-insensitive duplicates, and caps the length", () => {
    let state = run(emptyField, { type: "addAdhoc", name: "  Grandpa's rye  " });
    expect(state.entries).toEqual([{ kind: "adhoc", key: "grandpa's rye", name: "Grandpa's rye" }]);
    state = run(state, { type: "addAdhoc", name: "GRANDPA'S   RYE" });
    expect(state.entries).toHaveLength(1);
    expect(state.notice).toMatch(/already/i);
    state = run(state, { type: "addAdhoc", name: "   " });
    expect(state.entries).toHaveLength(1);
    state = run(state, { type: "addAdhoc", name: "x".repeat(121) });
    expect(state.entries).toHaveLength(1);
    expect(state.notice).toMatch(/120/);
  });

  it("refuses past 500 and says so; a later accepted action clears the notice", () => {
    const full = run(emptyField, { type: "selectAll", bottles: Array.from({ length: MAX_ENTRIES }, (_, i) => bottle(i + 1)) });
    expect(full.entries).toHaveLength(MAX_ENTRIES);
    expect(full.notice).toBeNull();
    const refused = run(full, { type: "toggleBottle", bottle: bottle(9999) });
    expect(refused.entries).toHaveLength(MAX_ENTRIES);
    expect(refused.notice).toMatch(/500/);
    expect(run(full, { type: "addAdhoc", name: "x" }).notice).toMatch(/500/);
    expect(run(full, { type: "addLabel", label: label(1) }).entries).toHaveLength(MAX_ENTRIES);
    expect(run(refused, { type: "remove", key: entryKey(bottle(1)) }).notice).toBeNull();
  });

  it("select all stops at the cap and reports that some were left out", () => {
    const near = run(emptyField, { type: "selectAll", bottles: Array.from({ length: MAX_ENTRIES - 1 }, (_, i) => bottle(i + 1)) });
    const out = run(near, { type: "selectAll", bottles: [bottle(1000), bottle(1001), bottle(1002)] });
    expect(out.entries).toHaveLength(MAX_ENTRIES);
    expect(out.notice).toMatch(/500/);
  });

  it("does not mutate the state it was given", () => {
    const state = run(emptyField, { type: "toggleBottle", bottle: bottle(1) });
    const snapshot = JSON.stringify(state);
    run(state, { type: "toggleBottle", bottle: bottle(2) }, { type: "clear" });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("toEntryInputs and counts", () => {
  const state = run(
    emptyField,
    { type: "toggleBottle", bottle: bottle(1) },
    { type: "addLabel", label: label(7) },
    { type: "addAdhoc", name: "Outside" },
  );

  it("maps each entry to its API input", () => {
    expect(toEntryInputs(state.entries)).toEqual([{ bottleId: 1 }, { expressionId: 7 }, { name: "Outside" }]);
  });

  it("counts by kind", () => {
    expect(counts(state.entries)).toEqual({ bottles: 1, labels: 1, adhoc: 1, total: 3 });
    expect(counts([])).toEqual({ bottles: 0, labels: 0, adhoc: 0, total: 0 });
  });

  it("counts how many of the shown bottles are chosen", () => {
    expect(chosenAmong(state.entries, [bottle(1), bottle(2)])).toBe(1);
    expect(chosenAmong([], [bottle(1)])).toBe(0);
  });
});
