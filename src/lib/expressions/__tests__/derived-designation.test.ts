import { describe, expect, it } from "vitest";
import { withDerivedDesignation } from "../derived-designation";

describe("withDerivedDesignation", () => {
  it("sets a tequila's class as the age is typed", () => {
    expect(withDerivedDesignation({ ageMonths: "1" }, "ageMonths", "tequila")).toMatchObject({ tequilaClass: "blanco" });
    expect(withDerivedDesignation({ ageMonths: "8" }, "ageMonths", "tequila")).toMatchObject({ tequilaClass: "reposado" });
    expect(withDerivedDesignation({ ageYears: "2" }, "ageYears", "tequila")).toMatchObject({ tequilaClass: "anejo" });
    expect(withDerivedDesignation({ ageYears: "4" }, "ageYears", "tequila")).toMatchObject({ tequilaClass: "extra-anejo" });
  });
  it("gives a mezcal no Extra Añejo", () => {
    expect(withDerivedDesignation({ ageYears: "4" }, "ageYears", "mezcal")).toMatchObject({ tequilaClass: "anejo" });
  });
  it("never moves a Joven or a Cristalino, and does nothing when the age is cleared", () => {
    expect(withDerivedDesignation({ ageYears: "4", tequilaClass: "joven" }, "ageYears", "tequila")).toMatchObject({ tequilaClass: "joven" });
    expect(withDerivedDesignation({ ageYears: "4", tequilaClass: "cristalino" }, "ageYears", "tequila")).toMatchObject({ tequilaClass: "cristalino" });
    expect(withDerivedDesignation({ ageYears: "", tequilaClass: "reposado" }, "ageYears", "tequila")).toMatchObject({ tequilaClass: "reposado" });
  });
  it("does not count years left behind in a field a Blanco hides", () => {
    expect(withDerivedDesignation({ ageYears: "4", ageMonths: "1", tequilaClass: "blanco" }, "ageMonths", "tequila")).toMatchObject({ tequilaClass: "blanco" });
    expect(withDerivedDesignation({ ageYears: "4", ageMonths: "8", tequilaClass: "blanco" }, "ageMonths", "tequila")).toMatchObject({ tequilaClass: "reposado" });
  });
  it("only acts when an age field is what changed", () => {
    expect(withDerivedDesignation({ ageYears: "4", tequilaClass: "blanco" }, "proof", "tequila")).toMatchObject({ tequilaClass: "blanco" });
  });
  it("sets a brandy's designation from the age, or from the statement", () => {
    expect(withDerivedDesignation({ ageYears: "5" }, "ageYears", "cognac")).toMatchObject({ brandyGrade: "VSOP" });
    expect(withDerivedDesignation({ ageStatement: "Napoleon" }, "ageStatement", "armagnac")).toMatchObject({ brandyGrade: "Napoléon" });
    expect(withDerivedDesignation({ ageYears: "12", brandyGrade: "Hors d'Âge" }, "ageYears", "armagnac")).toMatchObject({ brandyGrade: "Hors d'Âge" });
  });
  it("leaves other spirits alone", () => {
    const values = { ageYears: "5" };
    expect(withDerivedDesignation(values, "ageYears", "pisco")).toBe(values);
    expect(withDerivedDesignation(values, "ageYears", "american")).toBe(values);
  });
});
