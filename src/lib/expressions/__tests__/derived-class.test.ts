import { describe, expect, it } from "vitest";
import { ageInYears, agaveClassFromYears, brandyGradeFromStatement, brandyGradeFromYears, brandyGradesFor } from "../spirit-details";

describe("ageInYears", () => {
  it("is null with nothing typed, and adds years, months and days", () => {
    expect(ageInYears("", "", "")).toBeNull();
    expect(ageInYears(null, undefined, "")).toBeNull();
    expect(ageInYears("2", "", "")).toBe(2);
    expect(ageInYears("", "6", "")).toBe(0.5);
    expect(ageInYears("1", "6", "")).toBe(1.5);
  });
  it("is null for text that is not a number", () => {
    expect(ageInYears("abc", "", "")).toBeNull();
  });
});

describe("agaveClassFromYears", () => {
  it("is Blanco under 2 months, Reposado under a year, Añejo from a year, Extra Añejo from 3 (tequila)", () => {
    expect(agaveClassFromYears("tequila", 1 / 12)).toBe("blanco");
    expect(agaveClassFromYears("tequila", 2 / 12)).toBe("reposado");
    expect(agaveClassFromYears("tequila", 0.99)).toBe("reposado");
    expect(agaveClassFromYears("tequila", 1)).toBe("anejo");
    expect(agaveClassFromYears("tequila", 2.9)).toBe("anejo");
    expect(agaveClassFromYears("tequila", 3)).toBe("extra-anejo");
  });
  it("has no Extra Añejo for mezcal, and no class for anything else", () => {
    expect(agaveClassFromYears("mezcal", 5)).toBe("anejo");
    expect(agaveClassFromYears("mezcal", 0.1)).toBe("blanco");
    expect(agaveClassFromYears("cognac", 5)).toBeNull();
  });
});

describe("brandy designations", () => {
  it("offers each kind its own list", () => {
    expect(brandyGradesFor("cognac")).toEqual(["VS", "VSOP", "XO"]);
    expect(brandyGradesFor("armagnac")).toEqual(["VS", "VSOP", "Napoléon", "XO", "Hors d'Âge"]);
    expect(brandyGradesFor("calvados")).toEqual(["VS", "Vieux", "VSOP", "XO"]);
    expect(brandyGradesFor("pisco")).toEqual([]);
  });
  it("works the designation out from an age, and leaves Hors d'Âge to be chosen", () => {
    expect(brandyGradeFromYears("cognac", 1)).toBeNull();
    expect(brandyGradeFromYears("cognac", 2)).toBe("VS");
    expect(brandyGradeFromYears("cognac", 6)).toBe("VSOP");
    expect(brandyGradeFromYears("cognac", 12)).toBe("XO");
    expect(brandyGradeFromYears("armagnac", 6)).toBe("Napoléon");
    expect(brandyGradeFromYears("armagnac", 12)).toBe("XO");
    expect(brandyGradeFromYears("calvados", 3)).toBe("Vieux");
    expect(brandyGradeFromYears("calvados", 6)).toBe("XO");
    expect(brandyGradeFromYears("apple", 10)).toBeNull();
  });
  it("reads the designation from the words of an age statement, only where the kind has it", () => {
    expect(brandyGradeFromStatement("cognac", "V.S.O.P.")).toBe("VSOP");
    expect(brandyGradeFromStatement("cognac", "vsop reserve")).toBe("VSOP");
    expect(brandyGradeFromStatement("cognac", "XO Premium")).toBe("XO");
    expect(brandyGradeFromStatement("armagnac", "Napoleon")).toBe("Napoléon");
    expect(brandyGradeFromStatement("armagnac", "Hors d'Age")).toBe("Hors d'Âge");
    expect(brandyGradeFromStatement("armagnac", "Three Star")).toBe("VS");
    expect(brandyGradeFromStatement("calvados", "Vieille Réserve")).toBe("VSOP");
    expect(brandyGradeFromStatement("calvados", "Fine")).toBe("VS");
    expect(brandyGradeFromStatement("calvados", "Napoléon")).toBe("XO");
    expect(brandyGradeFromStatement("calvados", "Hors d'Age")).toBe("XO");
    expect(brandyGradeFromStatement("cognac", "Napoleon")).toBeNull();
    expect(brandyGradeFromStatement("cognac", "Small batch")).toBeNull();
  });
});
