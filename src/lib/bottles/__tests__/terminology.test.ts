import { describe, expect, it } from "vitest";
import { effectiveBottleStatus, isOnShelf, isSealedBottle, releaseUnit } from "../terminology";

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

describe("isSealedBottle", () => {
  it("is true only for an owned, unopened, full bottle", () => {
    expect(isSealedBottle({ status: "owned", isOpen: false, fillPct: 100 })).toBe(true);
  });

  it("is false once the bottle is open, however it got there", () => {
    expect(isSealedBottle({ status: "owned", isOpen: true, fillPct: 100 })).toBe(false);
    expect(isSealedBottle({ status: "open", isOpen: false, fillPct: 100 })).toBe(false);
  });

  it("is false for an owned bottle under full, which the server treats as open", () => {
    expect(isSealedBottle({ status: "owned", isOpen: false, fillPct: 60 })).toBe(false);
  });

  it("is false for killed and wishlist bottles", () => {
    expect(isSealedBottle({ status: "killed", isOpen: false, fillPct: 100 })).toBe(false);
    expect(isSealedBottle({ status: "wishlist", isOpen: false, fillPct: 100 })).toBe(false);
  });
});

describe("isOnShelf", () => {
  it("is true for a bottle you have, sealed or open", () => {
    expect(isOnShelf("owned")).toBe(true);
    expect(isOnShelf("open")).toBe(true);
  });

  it("is false for everything else, which is never asked how much is left", () => {
    for (const status of ["killed", "sold", "traded", "wishlist", "sampled"] as const) {
      expect(isOnShelf(status)).toBe(false);
    }
  });
});
