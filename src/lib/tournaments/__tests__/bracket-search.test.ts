import { describe, expect, it } from "vitest";
import { fold, matchEntries, stepMatch } from "../bracket-search";
import type { ViewHeat } from "../view";

const e = (entryId: number, name: string) => ({ entryId, name, place: null, glass: null, proof: null, mashbill: null, ageYears: null, distilleries: [], category: null, finishes: [] });
const heat = (id: number, round: number, entries: ReturnType<typeof e>[], hidden = false): ViewHeat => ({
  id, round, slot: id, status: "pending", label: null, autoLabel: null, band: "", hidden, entryCount: entries.length || 2, glasses: [], entries: hidden ? [] : entries,
});
const view = {
  rounds: [
    { round: 1, heats: [heat(1, 1, [e(1, "Eagle Rare 10"), e(2, "Blanton's")]), heat(2, 1, [e(3, "Pàppy Van Winkle"), e(4, "Eagle Rare 17")])] },
    { round: 2, heats: [heat(3, 2, [], true)] },
  ],
};

describe("matchEntries", () => {
  it("finds names in page order, ignoring case and accents", () => {
    expect(matchEntries(view, "eagle")).toEqual([{ entryId: 1, heatId: 1, round: 1 }, { entryId: 4, heatId: 2, round: 1 }]);
    expect(matchEntries(view, "PAPPY")).toEqual([{ entryId: 3, heatId: 2, round: 1 }]);
  });
  it("needs every word, in any order", () => {
    expect(matchEntries(view, "rare 17").map((m) => m.entryId)).toEqual([4]);
    expect(matchEntries(view, "17 eagle").map((m) => m.entryId)).toEqual([4]);
    expect(matchEntries(view, "eagle pappy")).toEqual([]);
  });
  it("matches nothing for a blank query", () => {
    expect(matchEntries(view, "   ")).toEqual([]);
  });
  it("never matches a hidden flight, and no hidden name can leak into a result", () => {
    const withHidden = { rounds: [{ round: 1, heats: [{ ...heat(9, 1, [e(7, "Secret Barrel")], true), entries: [e(7, "Secret Barrel")] }] }] };
    expect(matchEntries(withHidden, "secret")).toEqual([]);
    expect(JSON.stringify(matchEntries(view, "e"))).not.toMatch(/Secret/);
  });
});

describe("fold", () => {
  it("removes accents and case", () => expect(fold("Pàppy VAN")).toBe("pappy van"));
});

describe("stepMatch", () => {
  it("starts at the first going on, the last going back, and wraps", () => {
    expect(stepMatch(3, null, 1)).toBe(0);
    expect(stepMatch(3, null, -1)).toBe(2);
    expect(stepMatch(3, 2, 1)).toBe(0);
    expect(stepMatch(3, 0, -1)).toBe(2);
    expect(stepMatch(0, null, 1)).toBeNull();
  });
});
