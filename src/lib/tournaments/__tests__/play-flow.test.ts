import { describe, expect, it } from "vitest";
import { flowReducer, initialFlow, lettersFor, lettersProblem, moveItem, shuffledLetters, type Flow, type MappingRow } from "../play-flow";

const row = (entryId: number, name: string, glass: string): MappingRow => ({ entryId, name, proof: 100, mashbill: null, ageYears: null, glass });
const mapping = (rows: MappingRow[], saved = true): Flow => ({ stage: "mapping", rows, saved, base: rows.map((r) => r.glass) });

describe("moveItem", () => {
  it("swaps with the neighbour and stops at the ends", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
  it("does not change its input", () => {
    const list = ["a", "b"];
    moveItem(list, 0, 1);
    expect(list).toEqual(["a", "b"]);
  });
});

describe("letters", () => {
  it("run from A, up to four", () => {
    expect(lettersFor(3)).toEqual(["A", "B", "C"]);
    expect(lettersFor(2)).toEqual(["A", "B"]);
  });
  it("a shuffle uses each letter once", () => {
    for (let i = 0; i < 20; i++) expect(shuffledLetters(4).sort()).toEqual(["A", "B", "C", "D"]);
    expect(shuffledLetters(3, () => 0)).toEqual(["B", "C", "A"]);
  });
  it("problems: missing, outside the set, repeated", () => {
    expect(lettersProblem(["A", "B", "C"])).toBeNull();
    expect(lettersProblem(["C", "A", "B"])).toBeNull();
    expect(lettersProblem(["A", "A", "B"])).toMatch(/own letter/);
    expect(lettersProblem(["A", "D", "B"])).toMatch(/from A, B, C/);
    expect(lettersProblem(["A", null])).toMatch(/from A, B/);
  });
});

describe("flowReducer", () => {
  const rows = [row(1, "Old Forester", "B"), row(2, "Four Roses", "A"), row(3, "Wild Turkey", "C")];

  it("starts at start, or loading when the pourer drew the flight", () => {
    expect(initialFlow(false)).toEqual({ stage: "start" });
    expect(initialFlow(true)).toEqual({ stage: "loading" });
  });

  it("goes start -> loading -> mapping, and back to start when loading fails", () => {
    const loading = flowReducer({ stage: "start" }, { type: "show" });
    expect(loading).toEqual({ stage: "loading" });
    expect(flowReducer(loading, { type: "failed" })).toEqual({ stage: "start" });
    expect(flowReducer(loading, { type: "loaded", rows })).toEqual(mapping(rows));
    // loaded is ignored outside loading
    expect(flowReducer({ stage: "start" }, { type: "loaded", rows })).toEqual({ stage: "start" });
  });

  it("editing a letter makes the mapping unsaved; saving makes it saved", () => {
    const edited = flowReducer(mapping(rows), { type: "setGlass", entryId: 1, glass: "D" });
    expect(edited).toMatchObject({ stage: "mapping", saved: false });
    expect((edited as { rows: MappingRow[] }).rows.map((r) => r.glass)).toEqual(["D", "A", "C"]);
    expect(flowReducer(edited, { type: "saved" })).toMatchObject({ saved: true });
    // putting the letter back to what the server has counts as saved again
    expect(flowReducer(edited, { type: "setGlass", entryId: 1, glass: "B" })).toMatchObject({ saved: true });
    const all = flowReducer(mapping(rows), { type: "setAll", letters: ["C", "B", "A"] }) as { rows: MappingRow[]; saved: boolean };
    expect(all.rows.map((r) => r.glass)).toEqual(["C", "B", "A"]);
    expect(all.saved).toBe(false);
  });

  it("hide drops the names: the rank state holds only letters, in order", () => {
    const ranked = flowReducer(mapping(rows), { type: "hide" });
    expect(ranked).toEqual({ stage: "rank", order: ["A", "B", "C"] });
    const text = JSON.stringify(ranked);
    for (const name of ["Old Forester", "Four Roses", "Wild Turkey"]) expect(text).not.toContain(name);
  });

  it("hide is refused while the letters are unsaved or invalid", () => {
    const unsaved = mapping(rows, false);
    expect(flowReducer(unsaved, { type: "hide" })).toBe(unsaved);
    const repeated = mapping([row(1, "a", "A"), row(2, "b", "A")]);
    expect(flowReducer(repeated, { type: "hide" })).toBe(repeated);
  });

  it("ranking moves letters and records into revealed; names cannot come back from there", () => {
    let s: Flow = { stage: "rank", order: ["A", "B", "C"] };
    s = flowReducer(s, { type: "move", index: 2, delta: -1 });
    s = flowReducer(s, { type: "move", index: 0, delta: -1 });
    expect(s).toEqual({ stage: "rank", order: ["A", "C", "B"] });
    expect(flowReducer(s, { type: "recorded" })).toEqual({ stage: "revealed" });
    expect(flowReducer({ stage: "revealed" }, { type: "move", index: 0, delta: 1 })).toEqual({ stage: "revealed" });
    expect(flowReducer({ stage: "rank", order: ["A"] }, { type: "show" })).toEqual({ stage: "rank", order: ["A"] });
  });

  it("restart leads back to start (letters missing)", () => {
    expect(flowReducer({ stage: "rank", order: ["A"] }, { type: "restart" })).toEqual({ stage: "start" });
  });
});
