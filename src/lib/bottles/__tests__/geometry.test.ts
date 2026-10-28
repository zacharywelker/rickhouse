import { describe, expect, it } from "vitest";
import { FILL_TICK_STEP, clampPct, needleDeg, nudgePct, pctFromDial, snapToTick } from "../geometry";

/** A point `pct` of the way round the dial from the left horizon, `r` out from the hub. */
function along(pct: number, r = 40): [number, number] {
  const a = Math.PI - (pct / 100) * Math.PI;
  return [Math.cos(a) * r, -Math.sin(a) * r];
}

describe("clampPct", () => {
  it("rounds to a whole percent", () => {
    expect(clampPct(63.4)).toBe(63);
    expect(clampPct(63.6)).toBe(64);
  });

  it("clamps to 0..100", () => {
    expect(clampPct(-20)).toBe(0);
    expect(clampPct(140)).toBe(100);
  });

  it("treats NaN as empty and Infinity as full", () => {
    expect(clampPct(Number.NaN)).toBe(0);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(100);
  });
});

describe("needleDeg", () => {
  it("points left at Empty, up at half, right at Full", () => {
    expect(needleDeg(0)).toBe(-90);
    expect(needleDeg(50)).toBe(0);
    expect(needleDeg(100)).toBe(90);
  });

  it("clamps out-of-range input", () => {
    expect(needleDeg(500)).toBe(90);
  });
});

describe("snapToTick", () => {
  it("ticks every 5%", () => {
    expect(FILL_TICK_STEP).toBe(5);
  });

  it("goes to the nearest tick", () => {
    expect(snapToTick(63)).toBe(65);
    expect(snapToTick(62)).toBe(60);
    expect(snapToTick(100)).toBe(100);
  });
});

describe("nudgePct", () => {
  it("moves an on-tick value one tick", () => {
    expect(nudgePct(60, 1)).toBe(65);
    expect(nudgePct(60, -1)).toBe(55);
  });

  it("moves an off-tick value to the next tick in that direction", () => {
    expect(nudgePct(63, -1)).toBe(60);
    expect(nudgePct(63, 1)).toBe(65);
  });

  it("stops at the ends, and a stray 3% is one tick from either", () => {
    expect(nudgePct(100, 1)).toBe(100);
    expect(nudgePct(0, -1)).toBe(0);
    expect(nudgePct(3, -1)).toBe(0);
    expect(nudgePct(3, 1)).toBe(5);
  });

  it("moves a quarter on the 5% grid", () => {
    expect(nudgePct(60, -1, true)).toBe(35);
    expect(nudgePct(90, 1, true)).toBe(100);
  });
});

describe("pctFromDial", () => {
  it("reads straight up as half", () => {
    expect(pctFromDial(0, -40)).toBe(50);
  });

  it("reads the right and left horizons as Full and Empty", () => {
    expect(pctFromDial(40, 0)).toBe(100);
    // dy is 0 here, and atan2(-0, -x) is -π: the left peg must still read Empty.
    expect(pctFromDial(-40, 0)).toBe(0);
  });

  it("detents onto the nearest tick", () => {
    expect(pctFromDial(...along(33))).toBe(35);
    expect(pctFromDial(...along(5))).toBe(5);
  });

  it("only the very end of the dial is Empty", () => {
    expect(pctFromDial(...along(2))).toBe(0);
  });

  it("sticks to the nearer peg once the pointer is below the hub", () => {
    expect(pctFromDial(-5, 30)).toBe(0);
    expect(pctFromDial(5, 30)).toBe(100);
  });
});
