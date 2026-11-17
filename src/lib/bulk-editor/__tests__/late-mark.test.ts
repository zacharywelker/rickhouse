import { describe, expect, it } from "vitest";
import { LIQUID_FIELDS, routeLiquid } from "../late-mark";

const cells = { proof: "118.3", ageYears: "8", ageStatement: "Small batch", tequilaClass: "reposado", brandyGrade: "vs", sizeMl: "700", msrp: "60" };

describe("which values move to the bottle when a single barrel or private selection is marked", () => {
  it("names the values that describe the liquid, and not the size", () => {
    expect([...LIQUID_FIELDS].sort()).toEqual(["ageDays", "ageMonths", "ageStatement", "ageYears", "brandyGrade", "proof", "tequilaClass"]);
    expect(LIQUID_FIELDS).not.toContain("sizeMl");
  });
  it("sends them to the bottle when marked, and keeps size and the rest on the label", () => {
    const out = routeLiquid(cells, true, false);
    expect(out.bottle).toEqual({ proof: "118.3", ageYears: "8", ageStatement: "Small batch", tequilaClass: "reposado", brandyGrade: "vs" });
    expect(out.label).toEqual({ sizeMl: "700", msrp: "60" });
  });
  it("sends them to the label when not marked, so un-marking before the row saves puts them back", () => {
    const out = routeLiquid(cells, false, false);
    expect(out.bottle).toEqual({});
    expect(out.label).toEqual(cells);
  });
  it("keeps them on the label although marked, when that was asked for (Undo)", () => {
    expect(routeLiquid(cells, true, true).label).toEqual(cells);
    expect(routeLiquid(cells, true, true).bottle).toEqual({});
  });
});
