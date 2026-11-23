import { describe, expect, it } from "vitest";
import { swapIdInFilterQuery } from "../group-filter";

describe("swapIdInFilterQuery", () => {
  it("replaces the removed id with the survivor's in the named list", () => {
    expect(swapIdInFilterQuery("pick=1&store=3", "store", 3, 8)).toBe("pick=1&store=8");
  });

  it("keeps the rest of the list and does not repeat an id the list already has", () => {
    expect(swapIdInFilterQuery("brand=3,7,12", "brand", 7, 12)).toBe("brand=3,12");
    expect(swapIdInFilterQuery("brand=3,7", "brand", 7, 9)).toBe("brand=3,9");
  });

  it("matches whole ids, never part of a longer one", () => {
    expect(swapIdInFilterQuery("tag=13,30", "tag", 3, 5)).toBeNull();
  });

  it("leaves other parameters alone, even ones that hold the same number", () => {
    expect(swapIdInFilterQuery("brand=3&store=3", "store", 3, 8)).toBe("brand=3&store=8");
  });

  it("returns null when nothing changes", () => {
    expect(swapIdInFilterQuery("store=4", "store", 3, 8)).toBeNull();
    expect(swapIdInFilterQuery("pick=1", "store", 3, 8)).toBeNull();
    expect(swapIdInFilterQuery("", "store", 3, 8)).toBeNull();
  });
});
