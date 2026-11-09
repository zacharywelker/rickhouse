import { describe, expect, it } from "vitest";
import { FINISH_PAIR_TOTAL_MESSAGE, resolveFinishPairs, type FinishRowInput } from "../finish-pairs";

// Mashbills: 1 = 84/8/8, 2 = 70/22/8, 3 = 70/21/9. Finishes: 10 Cognac, 11 Madeira, 12 Sherry,
// 13 Port, 14 Vino de Naranja, 15 Vanilla Cognac, 16 Apricot Brandy, 17 Winter Bock.
const blueNote = (): FinishRowInput[] => [
  { finishId: 10, share: null, mashbills: [{ mashbillId: 1, share: 3 }, { mashbillId: 3, share: 12 }] },
  { finishId: 11, share: 2, mashbills: [{ mashbillId: 3, share: 2 }] },
  { finishId: 12, share: 3, mashbills: [{ mashbillId: 2, share: 3 }] },
  { finishId: 13, share: 3, mashbills: [{ mashbillId: 1, share: 3 }] },
  { finishId: 14, share: 41, mashbills: [{ mashbillId: 3, share: 41 }] },
  { finishId: 15, share: 15, mashbills: [{ mashbillId: 3, share: 15 }] },
  { finishId: 16, share: 11, mashbills: [{ mashbillId: 3, share: 11 }] },
  { finishId: 17, share: 10, mashbills: [{ mashbillId: 3, share: 10 }] },
];

describe("resolveFinishPairs", () => {
  it("resolves the 2026 Blue Note Special Reserve", () => {
    const out = resolveFinishPairs([1, 2, 3], blueNote());
    expect(out.errors).toEqual([]);
    expect(out.pairs).toHaveLength(9);
    expect(out.pairs.map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Object.fromEntries(out.mashbillShares)).toEqual({ 1: 6, 2: 3, 3: 91 });
    expect(Object.fromEntries(out.finishShares)).toEqual({ 10: 15, 11: 2, 12: 3, 13: 3, 14: 41, 15: 15, 16: 11, 17: 10 });
  });

  it("pairs a finish with no mashbills on a one-mashbill label with that mashbill", () => {
    const out = resolveFinishPairs([7], [{ finishId: 10, share: null }]);
    expect(out.errors).toEqual([]);
    expect(out.pairs).toEqual([{ mashbillId: 7, finishId: 10, share: null, position: 0 }]);
  });

  it("defaults a finish with none listed to the first mashbill when there are several", () => {
    const out = resolveFinishPairs([4, 5], [{ finishId: 10, share: 60 }, { finishId: 11, share: 40 }]);
    expect(out.pairs.map((p) => p.mashbillId)).toEqual([4, 4]);
    expect(out.errors).toEqual([]);
  });

  it("makes no pairs, and no complaint, when the label has no mashbills", () => {
    expect(resolveFinishPairs([], [{ finishId: 10, share: null }])).toMatchObject({ pairs: [], errors: [] });
  });

  it.each([[99, "1 under"], [101, "1 over"]])("rejects shares adding to %i, naming the difference", (total, words) => {
    const rows: FinishRowInput[] = [{ finishId: 10, share: total - 50 }, { finishId: 11, share: 50 }];
    const out = resolveFinishPairs([1], rows);
    expect(out.errors).toEqual([FINISH_PAIR_TOTAL_MESSAGE(total - 100)]);
    expect(out.errors[0]).toContain(words);
    expect(out.mashbillShares.size).toBe(0);
  });

  it("rejects one typed share with the rest blank", () => {
    const out = resolveFinishPairs([1], [{ finishId: 10, share: 50 }, { finishId: 11, share: null }]);
    expect(out.errors).toHaveLength(1);
  });

  it("accepts all shares blank and rolls nothing up", () => {
    const out = resolveFinishPairs([1, 2], [{ finishId: 10, share: null }, { finishId: 11, share: null }]);
    expect(out.errors).toEqual([]);
    expect(out.mashbillShares.size + out.finishShares.size).toBe(0);
  });

  it("pairs an unfinished row with finishId null and counts it toward the mashbill", () => {
    const out = resolveFinishPairs([1], [{ finishId: 10, share: 30 }, { finishId: 11, share: 10 }, { finishId: null, share: 60 }]);
    expect(out.errors).toEqual([]);
    expect(out.pairs.at(-1)).toMatchObject({ mashbillId: 1, finishId: null, share: 60 });
    expect(out.mashbillShares.get(1)).toBe(100);
    expect(out.finishShares.has(0)).toBe(false);
  });

  it("rejects the same finish twice on one mashbill", () => {
    const out = resolveFinishPairs([1], [{ finishId: 10, share: 50 }, { finishId: 10, share: 50 }]);
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("rejects two unfinished rows on one mashbill", () => {
    const out = resolveFinishPairs([1], [{ finishId: null, share: 50 }, { finishId: null, share: 50 }]);
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("rejects a pair naming a mashbill that is not on the label", () => {
    const out = resolveFinishPairs([1], [{ finishId: 10, share: null, mashbills: [{ mashbillId: 9, share: null }] }]);
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.pairs).toEqual([]);
  });
});
