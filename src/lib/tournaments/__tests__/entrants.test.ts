import { describe, expect, it } from "vitest";
import { buildEntrant, competitorId, entryDisplayName, entryKind, type EntryFacts } from "../entrants";

const facts = (over: Partial<EntryFacts> = {}): EntryFacts => ({
  proof: "90.00",
  ageYears: null,
  ageMonths: null,
  ageDays: null,
  fieldGroup: "whiskey",
  distilleries: [],
  finishes: [],
  category: "Bourbon",
  mashbills: [],
  ...over,
});

describe("entryKind and competitorId", () => {
  it("is a bottle when a bottle is set, a label when only a label is, and ad hoc otherwise", () => {
    expect(entryKind({ bottleId: 4, expressionId: 9 })).toBe("bottle");
    expect(entryKind({ bottleId: null, expressionId: 9 })).toBe("label");
    expect(entryKind({ bottleId: null, expressionId: null })).toBe("adhoc");
  });

  it("names the competitor by bottle, else label, and has none for an ad hoc entry", () => {
    expect(competitorId({ bottleId: 4, expressionId: 9 })).toBe("b:4");
    expect(competitorId({ bottleId: null, expressionId: 9 })).toBe("e:9");
    expect(competitorId({ bottleId: null, expressionId: null })).toBeNull();
  });
});

describe("entryDisplayName", () => {
  const base = { brand: "Weller", name: "12 Year", pickName: null, barrelNumber: null, releaseName: null, batch: null };

  it("is the brand and the label", () => {
    expect(entryDisplayName(base)).toBe("Weller 12 Year");
  });

  it("marks a pick by its name, else its barrel, else its release, else its batch", () => {
    expect(entryDisplayName({ ...base, pickName: "Fall barrel", barrelNumber: "12" })).toBe("Weller 12 Year “Fall barrel”");
    expect(entryDisplayName({ ...base, barrelNumber: "12", releaseName: "Spring" })).toBe("Weller 12 Year (barrel 12)");
    expect(entryDisplayName({ ...base, releaseName: "Spring 2024", batch: "B1" })).toBe("Weller 12 Year (Spring 2024)");
    expect(entryDisplayName({ ...base, batch: "B1" })).toBe("Weller 12 Year (batch B1)");
  });

  it("ignores blank marks", () => {
    expect(entryDisplayName({ ...base, pickName: "  ", batch: "" })).toBe("Weller 12 Year");
  });
});

describe("buildEntrant", () => {
  it("turns database strings into numbers and keeps a bad one as unknown", () => {
    const e = buildEntrant(7, "x", facts({ proof: "101.50", ageYears: "12.0" }));
    expect(e).toMatchObject({ id: 7, name: "x", proof: 101.5, ageYears: 12 });
    expect(buildEntrant(7, "x", facts({ proof: "n/a", ageYears: null })).proof).toBeNull();
    expect(buildEntrant(7, "x", facts({ proof: null })).proof).toBeNull();
  });

  it("adds months and days to the age in years", () => {
    expect(buildEntrant(1, "x", facts({ ageYears: "4", ageMonths: 6, ageDays: null })).ageYears).toBe(4.5);
    expect(buildEntrant(1, "x", facts({ ageYears: null, ageMonths: 18, ageDays: null })).ageYears).toBe(1.5);
    expect(buildEntrant(1, "x", facts({ ageYears: null })).ageYears).toBeNull();
  });

  it("passes distilleries and finishes through in order", () => {
    const e = buildEntrant(1, "x", facts({ distilleries: ["MGP", "Barton"], finishes: ["Sherry", "Port"] }));
    expect(e.distilleries).toEqual(["MGP", "Barton"]);
    expect(e.finishes).toEqual(["Sherry", "Port"]);
  });

  it("carries the leaf category name, or null when unknown", () => {
    expect(buildEntrant(1, "x", facts({ category: "Single Malt Scotch" })).category).toBe("Single Malt Scotch");
    expect(buildEntrant(1, "x", facts({ category: null })).category).toBeNull();
  });

  it("reads a recipe, a secret mashbill's name, a generic style, several mashbills and none", () => {
    const grains = [{ grain: "Corn", percent: "75.00" }, { grain: "Rye", percent: "21.00" }, { grain: "Malted Barley", percent: "4.00" }];
    expect(buildEntrant(1, "x", facts({ mashbills: [{ name: null, isGeneric: false, isSecret: false, grains }] })).mashbill).toEqual({
      kind: "recipe",
      name: null,
      grains: [{ grain: "Corn", percent: 75 }, { grain: "Rye", percent: 21 }, { grain: "Malted Barley", percent: 4 }],
    });
    expect(buildEntrant(1, "x", facts({ mashbills: [{ name: "Buffalo Trace High Rye", isGeneric: false, isSecret: true, grains }] })).mashbill).toMatchObject({
      kind: "recipe",
      name: "Buffalo Trace High Rye",
    });
    expect(buildEntrant(1, "x", facts({ mashbills: [{ name: "High Rye", isGeneric: true, isSecret: false, grains: [] }] })).mashbill).toEqual({
      kind: "generic",
      style: "High Rye",
    });
    expect(buildEntrant(1, "x", facts({ mashbills: [
      { name: null, isGeneric: false, isSecret: false, grains },
      { name: null, isGeneric: false, isSecret: false, grains },
    ] })).mashbill).toEqual({ kind: "blend" });
    expect(buildEntrant(1, "x", facts()).mashbill).toBeNull();
  });

  it("has no mashbill for a spirit that is not a whiskey", () => {
    const grains = [{ grain: "Corn", percent: "75.00" }];
    expect(buildEntrant(1, "x", facts({ fieldGroup: "rum", mashbills: [{ name: null, isGeneric: false, isSecret: false, grains }] })).mashbill).toBeNull();
  });
});
