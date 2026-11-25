import { describe, expect, it } from "vitest";
import { EXPRESSION_SECTIONS, fieldVisible, sectionVisible, writableFields } from "../fields";
import { BOTTLE_FIELDS, BOTTLE_SECTIONS } from "../bottle-fields";
import { expressionSchema } from "../schema";
import { FIELD_GROUPS } from "@/db/schema";

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

describe("retired fields are not in the forms", () => {
  it("drops Still proof from agave", () => {
    expect(writableFields("agave").has("isStillProof")).toBe(false);
  });
  it("drops the amaro and liqueur country and region", () => {
    for (const group of ["amaro", "liqueur"] as const) {
      const fields = writableFields(group);
      expect(fields.has("originCountry")).toBe(false);
      expect(fields.has("originRegion")).toBe(false);
    }
  });
  it("drops Bottle Count and the brandy designation from the bottle form", () => {
    const names = new Set(BOTTLE_FIELDS.map((field) => field.name));
    expect(names.has("bottleCount")).toBe(false);
    expect(names.has("brandyGrade")).toBe(false);
  });
  it("keeps the brandy designation on the label form", () => {
    const names = new Set(EXPRESSION_SECTIONS.flatMap((s) => s.fields).map((field) => field.name));
    expect(names.has("brandyGrade")).toBe(true);
  });
});

describe("sectionVisible", () => {
  it("always shows the sections common to every spirit", () => {
    for (const group of ["whiskey", "rum", "agave", "gin", "other"] as const) {
      expect(sectionVisible(section("identity"), group, {})).toBe(true);
      expect(sectionVisible(section("identity"), group, {})).toBe(true);
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

describe("fieldVisible", () => {
  const pickField = (name: string) => {
    const found = bottleSection("pick").fields.find((f) => f.name === name);
    if (!found) throw new Error(`no pick field ${name}`);
    return found;
  };

  it("hides pick name and picked-by for a plain single barrel", () => {
    expect(fieldVisible(pickField("pickName"), { isSingleBarrel: true })).toBe(false);
    expect(fieldVisible(pickField("pickedBy"), { isSingleBarrel: true })).toBe(false);
  });

  it("shows every pick field, including pick name and picked-by, for a private selection", () => {
    const values = { isSingleBarrelPick: true };
    for (const field of bottleSection("pick").fields) {
      expect(fieldVisible(field, values), `${field.name} should show for a private selection`).toBe(true);
    }
  });

  it("shows fields with no showWhenAny regardless of values", () => {
    expect(fieldVisible(pickField("barrelNumber"), {})).toBe(true);
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
      for (const name of ["brandId", "categoryId", "name", "proof", "msrp", "upc", "ageStatement", "isStraight", "isNas"]) {
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
    for (const group of ["whiskey", "rum", "agave", "gin", "amaro", "liqueur", "other"] as const) {
      for (const name of writableFields(group)) union.add(name);
    }
    expect([...everyField].filter((name) => !union.has(name))).toEqual([]);
  });
});

describe("Description help", () => {
  it("no longer says bottlers live here, and points at Distilled by", () => {
    const description = EXPRESSION_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === "description");
    if (!description || !("help" in description) || typeof description.help !== "string") {
      throw new Error("no description field with help");
    }
    expect(description.help).not.toContain("live here");
    expect(description.help).toContain("Distilled by");
  });
});

describe("the Still field", () => {
  it("is writable for every spirit", () => {
    for (const group of FIELD_GROUPS) {
      expect(writableFields(group).has("stillType"), `stillType for ${group}`).toBe(true);
    }
  });

  it("is drawn in a section with no field group, so every spirit shows it", () => {
    expect(section("still").fieldGroups).toBeUndefined();
    expect(section("still").showWhenAny).toBeUndefined();
    expect(section("still").fields.map((f) => f.name)).toEqual(["stillType"]);
  });

  it("accepts the five still types and rejects anything else on the label", () => {
    const shape = { brandId: "1", categoryId: "2", name: "X" };
    for (const stillType of ["pot", "column", "blend", "coffey", "3-chamber"]) {
      expect(expressionSchema.parse({ ...shape, stillType })).toMatchObject({ stillType });
    }
    expect(expressionSchema.safeParse({ ...shape, stillType: "kettle" }).success).toBe(false);
  });
});
