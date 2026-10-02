import { describe, expect, it } from "vitest";
import { readBottleValues, readNumber } from "../import-values";

describe("readBottleValues", () => {
  it("imports a row with no fill_pct column as a full, sealed bottle, not an empty one", () => {
    const values = readBottleValues({ brand: "Eagle Rare", expression: "10 Year", category: "Bourbon" });
    expect(values).toMatchObject({ fillPct: 100, isOpen: false, status: "owned", ignored: [] });
  });

  it("reads spreadsheet-style values", () => {
    const values = readBottleValues({ price_paid: "$1,089.99", fill_pct: "50%", is_open: "Yes", status: "Open" });
    expect(values).toMatchObject({ pricePaid: "1089.99", fillPct: 50, isOpen: true, status: "open", ignored: [] });
  });

  it("keeps the open flag and the Open status in step, both ways", () => {
    expect(readBottleValues({ status: "open", is_open: "false" })).toMatchObject({ isOpen: true, status: "open" });
    expect(readBottleValues({ status: "owned", is_open: "true" })).toMatchObject({ isOpen: true, status: "open" });
    expect(readBottleValues({ status: "killed", is_open: "true" })).toMatchObject({ isOpen: true, status: "killed" });
  });

  it("names every value it could not read instead of dropping it silently", () => {
    const values = readBottleValues({
      date_acquired: "9/15/2026",
      fill_pct: "half",
      status: "drank it",
      acquisition: "found it",
      is_open: "maybe",
      price_paid: "cheap",
    });
    expect(values).toMatchObject({
      dateAcquired: null,
      fillPct: 100,
      status: "owned",
      acquisition: "purchase",
      pricePaid: null,
    });
    expect(values.ignored.map((s) => s.split(" ")[0])).toEqual([
      "price_paid",
      "date_acquired",
      "acquisition",
      "status",
      "fill_pct",
      "is_open",
    ]);
  });

  it("rejects a date that only looks like one", () => {
    expect(readBottleValues({ date_acquired: "2026-02-30" }).dateAcquired).toBeNull();
    expect(readBottleValues({ date_acquired: "2026-02-28" }).dateAcquired).toBe("2026-02-28");
  });
});

describe("readNumber", () => {
  it("strips the units people type", () => {
    expect(readNumber("93 proof")).toBe("93");
    expect(readNumber("116.8°")).toBe("116.8");
    expect(readNumber("")).toBeNull();
    expect(readNumber("n/a")).toBeUndefined();
  });
});
