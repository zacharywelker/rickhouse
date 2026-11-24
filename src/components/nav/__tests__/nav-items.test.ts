import { describe, expect, it } from "vitest";
import { NARROW_QUERY, PLACES, isCurrent } from "../nav-items";

describe("main places", () => {
  it("are Collection, Journal, Flights, Numbers, in that order", () => {
    expect(PLACES.map((p) => p.label)).toEqual(["Collection", "Journal", "Flights", "Numbers"]);
  });

  it("point at the pages that exist (Flights keeps the /tournaments address)", () => {
    expect(PLACES.map((p) => p.href)).toEqual(["/bottles", "/journal", "/tournaments", "/numbers"]);
  });
});

describe("isCurrent", () => {
  it("matches the page and everything beneath it", () => {
    expect(isCurrent("/bottles", "/bottles")).toBe(true);
    expect(isCurrent("/bottles/12", "/bottles")).toBe(true);
    expect(isCurrent("/journal", "/journal")).toBe(true);
  });

  it("does not match a sibling that merely starts with the same letters", () => {
    expect(isCurrent("/bottlesx", "/bottles")).toBe(false);
  });

  it("does not mark Collection on the label pages", () => {
    expect(isCurrent("/expressions", "/bottles")).toBe(false);
  });
});

describe("narrow screens", () => {
  it("start under 720px", () => {
    expect(NARROW_QUERY).toBe("(max-width: 719px)");
  });
});
