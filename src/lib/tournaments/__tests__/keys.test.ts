import { describe, expect, it } from "vitest";
import { mashbillKey } from "../grains";
import { keyValue, sortEntrants } from "../keys";
import type { Entrant } from "../types";

const entrant = (id: number, over: Partial<Entrant> = {}): Entrant => ({
  id, name: `e${id}`, proof: null, mashbill: null, distilleries: [], ageYears: null, finishes: [], ...over,
});

describe("non-finite numbers", () => {
  it("sorts a NaN proof as unknown, after every known proof, instead of breaking the sort", () => {
    const proofs = [100, NaN, 95, 100, NaN, 90];
    const sorted = sortEntrants(proofs.map((proof, i) => entrant(i + 1, { proof })), ["proof", "mashbill", "distillery", "age", "finish"]);
    expect(sorted.map((e) => e.id)).toEqual([6, 3, 1, 4, 2, 5]);
  });

  it("treats a non-finite age as unknown", () => {
    expect(keyValue(entrant(1, { ageYears: NaN }), "age")).toBeNull();
    expect(keyValue(entrant(1, { ageYears: Infinity }), "age")).toBeNull();
  });

  it("drops grains with a non-finite percent, and is null when none remain", () => {
    const grains = (...g: [string, number][]) => ({ kind: "recipe" as const, name: null, grains: g.map(([grain, percent]) => ({ grain, percent })) });
    expect(mashbillKey(grains(["Rye", NaN], ["Corn", 75]))).toEqual(mashbillKey(grains(["Corn", 75])));
    expect(mashbillKey(grains(["Rye", NaN]))).toBeNull();
  });
});
