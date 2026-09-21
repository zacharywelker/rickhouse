import { describe, expect, it } from "vitest";
import { LIQUID_BOTTOM, LIQUID_TOP, clampPct, pctFromY, surfaceY } from "../geometry";

describe("clampPct", () => {
  it("rounds to whole percent", () => {
    expect(clampPct(63.4)).toBe(63);
    expect(clampPct(63.6)).toBe(64);
  });

  it("clamps out-of-range input", () => {
    expect(clampPct(-20)).toBe(0);
    expect(clampPct(140)).toBe(100);
  });

  it("treats NaN as empty rather than letting it through", () => {
    expect(clampPct(Number.NaN)).toBe(0);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(100);
  });
});

describe("surfaceY", () => {
  it("puts an empty bottle at the base and a full one at the neck", () => {
    expect(surfaceY(0)).toBe(LIQUID_BOTTOM);
    expect(surfaceY(100)).toBe(LIQUID_TOP);
  });

  it("puts half way at the midpoint", () => {
    expect(surfaceY(50)).toBeCloseTo((LIQUID_BOTTOM + LIQUID_TOP) / 2, 5);
  });

  it("moves the surface up as the bottle fills", () => {
    expect(surfaceY(75)).toBeLessThan(surfaceY(25));
  });
});

describe("pctFromY", () => {
  it("is the inverse of surfaceY", () => {
    for (const pct of [0, 1, 17, 33, 50, 66, 99, 100]) {
      expect(pctFromY(surfaceY(pct))).toBe(pct);
    }
  });

  it("clamps a drag past either end of the bottle", () => {
    expect(pctFromY(LIQUID_BOTTOM + 60)).toBe(0);
    expect(pctFromY(LIQUID_TOP - 60)).toBe(100);
  });
});
