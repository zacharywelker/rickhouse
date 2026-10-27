import { describe, expect, it } from "vitest";
import { clampPct, needleDeg, pctFromDial } from "../geometry";

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

describe("pctFromDial", () => {
  it("reads straight up as half", () => {
    expect(pctFromDial(0, -40)).toBe(50);
  });

  it("reads the right and left horizons as Full and Empty", () => {
    expect(pctFromDial(40, 0)).toBe(100);
    expect(pctFromDial(-40, 0)).toBe(0);
  });

  it("detents onto the quick states", () => {
    // 60° from the left horizon is 33%: closer to a quarter than to half.
    const dx = Math.cos(Math.PI - (Math.PI / 3)) * 40;
    const dy = -Math.sin(Math.PI - (Math.PI / 3)) * 40;
    expect(pctFromDial(dx, dy)).toBe(25);
  });

  it("sticks to the nearer peg once the pointer is below the hub", () => {
    expect(pctFromDial(-5, 30)).toBe(0);
    expect(pctFromDial(5, 30)).toBe(100);
  });

  it("only the very end of the dial is Empty", () => {
    const a = (Math.PI * 5) / 100; // 5% along from the left
    expect(pctFromDial(-Math.cos(a) * 40, -Math.sin(a) * 40)).toBe(10);
  });
});
