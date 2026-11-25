import { describe, expect, it } from "vitest";
import { bottleFieldNotUsed, type LabelFacts } from "../bottle-applicability";
import type { CategoryKind } from "../rules";
import { hidesWarehouse, withBottleSpiritFacts } from "../spirit-details";

const label: LabelFacts = { group: "whiskey", kind: "american", isAgedGin: false, tequilaClass: null };
const unusedFields = ["batch", "releaseYear", "releaseId", "isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "barrelFilledOn", "bottledOn", "ageYears", "ageMonths", "ageDays", "ageStatement"];

describe("bottleFieldNotUsed", () => {
  for (const group of ["vodka", "amaro", "liqueur"] as const) {
    it.each(unusedFields)(`does not use %s for ${group}`, (name) => {
      expect(bottleFieldNotUsed(name, { ...label, group, kind: group })).toBe("Not used for this spirit");
    });
  }

  it.each(["amaro", "liqueur"] as const)("does not allow a proof override for %s", (group) => {
    expect(bottleFieldNotUsed("proof", { ...label, group, kind: group })).toBe("Not used for this spirit");
  });

  for (const kind of ["gin", "genever"] as const) {
    it.each(["isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber"])(`uses %s only when ${kind} is aged`, (name) => {
      expect(bottleFieldNotUsed(name, { ...label, group: "gin", kind })).toBe("Only for aged gin");
      expect(bottleFieldNotUsed(name, { ...label, group: "gin", kind, isAgedGin: true })).toBeNull();
    });
    it.each([false, true])(`does not use a vintage choice for ${kind}, aged=%s`, (isAgedGin) => {
      expect(bottleFieldNotUsed("releaseId", { ...label, group: "gin", kind, isAgedGin })).not.toBeNull();
    });
  }

  it.each(["isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "ageYears", "ageStatement"])("uses %s for rum only when its label is aged", (name) => {
    expect(bottleFieldNotUsed(name, { ...label, group: "rum", kind: "other" })).toBe("Only for aged rum");
    expect(bottleFieldNotUsed(name, { ...label, group: "rum", kind: "other", isAged: true })).toBeNull();
  });

  it("gives a mezcal Madurado en Vidrio no age", () => {
    const glass: LabelFacts = { ...label, group: "agave", kind: "mezcal", tequilaClass: "madurado-en-vidrio" };
    for (const name of ["ageYears", "ageMonths", "ageDays", "ageStatement"]) expect(bottleFieldNotUsed(name, glass), name).toBe("Madurado en Vidrio has no age");
    expect(bottleFieldNotUsed("ageMonths", { ...glass, tequilaClass: "anejo" })).toBeNull();
  });

  it("uses a vintage choice for mezcal, but not tequila", () => {
    expect(bottleFieldNotUsed("releaseId", { ...label, group: "agave", kind: "tequila" })).toBe("Only for mezcal");
    expect(bottleFieldNotUsed("releaseId", { ...label, group: "agave", kind: "mezcal" })).toBeNull();
  });

  it("uses a class for tequila and mezcal only", () => {
    expect(bottleFieldNotUsed("tequilaClass", { ...label, group: "agave", kind: "tequila" })).toBeNull();
    expect(bottleFieldNotUsed("tequilaClass", { ...label, group: "agave", kind: "mezcal" })).toBeNull();
    expect(bottleFieldNotUsed("tequilaClass", { ...label, kind: "american" })).toBe("Only for tequila and mezcal");
  });

  it("uses the bottle's tequila class before the label's class for age", () => {
    const blanco: LabelFacts = { ...label, group: "agave", kind: "tequila", tequilaClass: "blanco" };
    // Blanco and Reposado take months and days, never years.
    expect(bottleFieldNotUsed("ageYears", blanco)).toBe("Blanco and Reposado are under a year");
    expect(bottleFieldNotUsed("ageYears", blanco, { tequilaClass: "anejo" })).toBeNull();
    expect(bottleFieldNotUsed("ageYears", { ...blanco, tequilaClass: "anejo" }, { tequilaClass: "reposado" })).toBe("Blanco and Reposado are under a year");
    for (const name of ["ageMonths", "ageDays"]) expect(bottleFieldNotUsed(name, blanco), name).toBeNull();
    expect(bottleFieldNotUsed("ageYears", { ...blanco, kind: "mezcal" })).toBe("Blanco and Reposado are under a year");
    expect(bottleFieldNotUsed("ageDays", { ...label, group: "gin", kind: "gin", isAgedGin: true })).toBe("Gin is aged in years and months");
  });

  it("keeps the existing bottle count and brandy grade rules", () => {
    expect(bottleFieldNotUsed("bottleCount", label)).toBeNull();
    expect(bottleFieldNotUsed("bottleCount", { ...label, group: "gin", kind: "gin" })).toBe("Only for aged gin");
    expect(bottleFieldNotUsed("brandyGrade", { ...label, group: "brandy", kind: "cognac" })).toBeNull();
    expect(bottleFieldNotUsed("brandyGrade", label)).toBe("No defined grade for this category");
  });
});

describe("hidesWarehouse", () => {
  it.each(["other", "absinthe", "akvavit", "shochu"] as const)("hides Warehouse and Rick / floor for Other kind %s", (kind) => {
    expect(hidesWarehouse("other", kind)).toBe(true);
    for (const name of ["warehouse", "rickFloor"]) {
      expect(bottleFieldNotUsed(name, { ...label, group: "other", kind })).not.toBeNull();
    }
  });

  it.each(["american", "japanese", "international", "flavored-whisky", "other", null] satisfies Array<CategoryKind | null>)("keeps warehouse fields for whiskey kind %s", (kind) => {
    expect(hidesWarehouse("whiskey", kind)).toBe(false);
  });

  it.each(["canadian", "irish", "scotch"] as const)("still hides warehouse fields for %s", (kind) => {
    expect(hidesWarehouse("whiskey", kind)).toBe(true);
  });
});

describe("withBottleSpiritFacts and the warehouse", () => {
  it("leaves warehouse and rick out for an absinthe, akvavit or shochu bottle, so a save cannot clear them", () => {
    for (const kind of ["absinthe", "akvavit", "shochu"] as const) {
      const out = withBottleSpiritFacts({ warehouse: null, rickFloor: null, notes: "x" }, kind, false, "other");
      expect("warehouse" in out, kind).toBe(false);
      expect("rickFloor" in out, kind).toBe(false);
    }
  });
  it("keeps them for an American whiskey", () => {
    expect(withBottleSpiritFacts({ warehouse: "A" }, "american", false, "whiskey")).toHaveProperty("warehouse", "A");
  });
});
