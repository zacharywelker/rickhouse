import { describe, expect, it } from "vitest";
import { advanceCount, advancers, isFinalPool, nextPool, planRounds, standings, type HeatResult } from "../rounds";

const ranked = (round: number, ids: number[]): HeatResult => ({
  round, kind: "ranked", entries: ids.map((entryId, i) => ({ entryId, place: i + 1 })),
});

describe("advanceCount", () => {
  it("advances half, at least one", () => {
    expect([1, 2, 3, 4].map(advanceCount)).toEqual([1, 1, 1, 2]);
  });
});

describe("advancers and nextPool", () => {
  it("takes the top of a ranked heat, whatever order the entries are listed in", () => {
    const heat: HeatResult = { round: 1, kind: "ranked", entries: [{ entryId: 7, place: 3 }, { entryId: 5, place: 1 }, { entryId: 6, place: 2 }, { entryId: 8, place: 4 }] };
    expect(advancers(heat)).toEqual([5, 6]);
  });

  it("sends a bye straight through", () => {
    expect(advancers({ round: 1, kind: "bye", entries: [{ entryId: 9, place: null }] })).toEqual([9]);
  });

  it("drops anyone withdrawn since", () => {
    const pool = nextPool([ranked(1, [1, 2, 3, 4]), ranked(1, [5, 6, 7, 8])], new Set([2]));
    expect(pool).toEqual([1, 5, 6]);
  });
});

describe("isFinalPool and planRounds", () => {
  it("makes the final the round whose pool fits in one heat", () => {
    expect(isFinalPool(4, 4)).toBe(true);
    expect(isFinalPool(5, 4)).toBe(false);
  });

  it("plans twelve bottles of four as three rounds", () => {
    expect(planRounds(12, 4)).toEqual([3, 2, 1]);
  });

  it("plans 101 bottles of two as seven rounds", () => {
    expect(planRounds(101, 2)).toEqual([51, 26, 13, 7, 4, 2, 1]);
  });

  it("handles the smallest fields", () => {
    expect(planRounds(2, 2)).toEqual([1]);
    expect(planRounds(5, 4)).toEqual([2, 1]);
  });

  it("refuses a heat size that is not a whole number of at least 2", () => {
    for (const bad of [0, 1, -1, 1.5, Number.NaN]) expect(() => planRounds(12, bad)).toThrow(RangeError);
  });

  it("refuses fewer than two entrants, or a count that is not a whole number", () => {
    for (const bad of [0, 1, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => planRounds(bad, 4)).toThrow(RangeError);
  });
});

describe("standings", () => {
  it("ranks by the round left, then the place, and shares a rank for equals", () => {
    const rows = standings([
      ranked(1, [1, 2, 3, 4]),
      ranked(1, [5, 6, 7, 8]),
      ranked(2, [1, 5, 2, 6]),
    ]);
    expect(rows.map((r) => [r.entryId, r.rank])).toEqual([
      [1, 1], [5, 2], [2, 3], [6, 4],
      [3, 5], [7, 5],
      [4, 7], [8, 7],
    ]);
  });
});
