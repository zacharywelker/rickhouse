import { describe, expect, it } from "vitest";
import { canPage, pageStep, scrollTarget, showTop } from "../page-scroll";

describe("page-scroll", () => {
  it("steps one screen minus the bar, never below a small minimum", () => {
    expect(pageStep(800, 72)).toBe(728);
    expect(pageStep(60, 72)).toBeGreaterThan(0);
  });
  it("clamps targets to the document", () => {
    expect(scrollTarget(0, 1, 800, 72, 3000)).toBe(728);
    expect(scrollTarget(2000, 1, 800, 72, 3000)).toBe(2200);
    expect(scrollTarget(2100, 1, 800, 72, 3000)).toBe(2200);
    expect(scrollTarget(100, -1, 800, 72, 3000)).toBe(0);
    expect(scrollTarget(0, 1, 800, 72, 500)).toBe(0);
  });
  it("disables up and down at the ends", () => {
    expect(canPage(0, 800, 3000)).toEqual({ up: false, down: true });
    expect(canPage(1000, 800, 3000)).toEqual({ up: true, down: true });
    expect(canPage(2200, 800, 3000)).toEqual({ up: true, down: false });
    expect(canPage(0, 800, 800)).toEqual({ up: false, down: false });
  });
  it("shows Top after half a screen", () => {
    expect(showTop(400, 800)).toBe(false);
    expect(showTop(401, 800)).toBe(true);
  });
});
