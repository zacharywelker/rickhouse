import { describe, expect, it } from "vitest";
import { effectiveBottleStatus, releaseUnit } from "../terminology";

describe("releaseUnit", () => {
  it("uses barrels for American whiskey", () => {
    expect(releaseUnit("whiskey", "american")).toBe("barrel");
  });

  it("uses casks for other whiskey styles", () => {
    expect(releaseUnit("whiskey", "scotch")).toBe("cask");
    expect(releaseUnit("whiskey", "other")).toBe("cask");
  });

  it("uses lots for agave spirits", () => {
    expect(releaseUnit("agave", "other")).toBe("lot");
  });
});

describe("effectiveBottleStatus", () => {
  it("treats stale owned statuses with an open flag or partial fill as open", () => {
    expect(effectiveBottleStatus({ status: "owned", isOpen: true, fillPct: 100 })).toBe("open");
    expect(effectiveBottleStatus({ status: "owned", isOpen: false, fillPct: 75 })).toBe("open");
  });

  it("keeps sealed and historical statuses intact", () => {
    expect(effectiveBottleStatus({ status: "owned", isOpen: false, fillPct: 100 })).toBe("owned");
    expect(effectiveBottleStatus({ status: "killed", isOpen: true, fillPct: 0 })).toBe("killed");
  });
});
