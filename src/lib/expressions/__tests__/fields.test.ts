import { describe, expect, it } from "vitest";
import { EXPRESSION_SECTIONS, sectionVisible, writableFields } from "../fields";
import { BOTTLE_SECTIONS } from "../bottle-fields";

const bottleSection = (id: string) => {
  const found = BOTTLE_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`no bottle section ${id}`);
  return found;
};

const section = (id: string) => {
  const found = EXPRESSION_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return found;
};

describe("sectionVisible", () => {
  it("always shows the sections common to every spirit", () => {
    for (const group of ["whiskey", "rum", "agave", "other"] as const) {
      expect(sectionVisible(section("identity"), group, {})).toBe(true);
      expect(sectionVisible(section("commercial"), group, {})).toBe(true);
    }
  });

  it("shows process for whiskey only", () => {
    expect(sectionVisible(section("process"), "whiskey", {})).toBe(true);
    expect(sectionVisible(section("process"), "rum", {})).toBe(false);
    expect(sectionVisible(section("process"), "agave", {})).toBe(false);
  });

  it("shows the rum and agave sections only for their own group", () => {
    expect(sectionVisible(section("rum"), "rum", {})).toBe(true);
    expect(sectionVisible(section("rum"), "whiskey", {})).toBe(false);
    expect(sectionVisible(section("agave"), "agave", {})).toBe(true);
    expect(sectionVisible(section("agave"), "rum", {})).toBe(false);
  });

  it("reveals the bottle's pick detail when either single-barrel box is ticked", () => {
    // The pick block moved to the bottle in M7, along with the flags that
    // reveal it — the label has no idea whether a given bottle was a pick.
    const pick = bottleSection("pick");
    expect(sectionVisible(pick, null, {})).toBe(false);
    expect(sectionVisible(pick, null, { isSingleBarrel: true })).toBe(true);
    expect(sectionVisible(pick, null, { isSingleBarrelPick: true })).toBe(true);
    expect(sectionVisible(pick, null, { isSingleBarrel: false, isSingleBarrelPick: false })).toBe(false);
  });

  it("keeps release identity off the label entirely", () => {
    const labelFields = new Set(EXPRESSION_SECTIONS.flatMap((s) => s.fields.map((f) => f.name)));
    for (const moved of ["batch", "releaseYear", "isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy"]) {
      expect(labelFields.has(moved), `${moved} should have moved to the bottle`).toBe(false);
    }
    const bottleFields = new Set(BOTTLE_SECTIONS.flatMap((s) => s.fields.map((f) => f.name)));
    for (const moved of ["batch", "releaseYear", "isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy"]) {
      expect(bottleFields.has(moved), `${moved} should be on the bottle`).toBe(true);
    }
  });
});

describe("writableFields", () => {
  it("lets whiskey write the process fields but not rum's", () => {
    const allowed = writableFields("whiskey");
    expect(allowed.has("isBottledInBond")).toBe(true);
    expect(allowed.has("charLevel")).toBe(true);
    expect(allowed.has("esterGl")).toBe(false);
    expect(allowed.has("agaveType")).toBe(false);
  });

  it("lets rum write ester and marque but not the whiskey process fields", () => {
    const allowed = writableFields("rum");
    expect(allowed.has("esterGl")).toBe(true);
    expect(allowed.has("marque")).toBe(true);
    expect(allowed.has("charLevel")).toBe(false);
  });

  it("always includes the common fields", () => {
    for (const group of ["whiskey", "rum", "agave", "gin", "other"] as const) {
      const allowed = writableFields(group);
      for (const name of ["brandId", "categoryId", "name", "proof", "msrp", "upc", "ageStatement"]) {
        expect(allowed.has(name)).toBe(true);
      }
    }
  });

  it("gives a group with no section of its own exactly the common fields", () => {
    // This is what makes "hidden fields are not cleared" work: the action
    // writes common + visible only, so a rum's esters survive being
    // recategorised as something with no rum section.
    const other = writableFields("other");
    expect(other.has("esterGl")).toBe(false);
    expect(other.has("charLevel")).toBe(false);
    expect(other.has("agaveType")).toBe(false);
  });

  it("covers every field the form can render", () => {
    const everyField = new Set(EXPRESSION_SECTIONS.flatMap((s) => s.fields.map((f) => f.name)));
    const union = new Set<string>();
    for (const group of ["whiskey", "rum", "agave", "other"] as const) {
      for (const name of writableFields(group)) union.add(name);
    }
    expect([...everyField].filter((name) => !union.has(name))).toEqual([]);
  });
});
