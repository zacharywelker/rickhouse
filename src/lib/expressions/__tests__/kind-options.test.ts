import { describe, expect, it } from "vitest";
import { EXPRESSION_SECTIONS } from "../fields";
import { specForKind, withProduction } from "../kind-options";

const field = (name: string) => EXPRESSION_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === name)!;
const values = (spec: ReturnType<typeof field>) => (spec.kind === "select" ? spec.options.map((o) => o.value) : []);

describe("a mezcal's production category", () => {
  const still = (production: string) => values(specForKind(field("stillType"), "mezcal", { mezcalProduction: production }));
  it("limits an Ancestral to a clay pot still, pit cooking and hand extraction", () => {
    expect(still("ancestral")).toEqual(["", "clay-pot"]);
    expect(values(specForKind(field("cookingMethod"), "mezcal", { mezcalProduction: "ancestral" }))).toEqual(["", "pit"]);
    expect(values(specForKind(field("extraction"), "mezcal", { mezcalProduction: "ancestral" }))).toEqual(["", "hand mallet"]);
  });
  it("rules out the column still and the diffuser for an Artesanal, and nothing for a plain mezcal", () => {
    expect(still("artesanal")).not.toContain("column");
    expect(still("artesanal")).toContain("pot");
    expect(values(specForKind(field("extraction"), "mezcal", { mezcalProduction: "artesanal" }))).not.toContain("diffuser");
    expect(still("mezcal")).toContain("column");
    expect(values(specForKind(field("extraction"), "mezcal", {}))).toContain("diffuser");
  });
  it("does not apply to tequila", () => {
    expect(values(specForKind(field("stillType"), "tequila", { mezcalProduction: "ancestral" }))).toContain("column");
  });
});

describe("withProduction", () => {
  it("presets an Ancestral's cooking and still, and replaces what it does not allow", () => {
    expect(withProduction({ cookingMethod: "", stillType: "", extraction: "" }, "ancestral")).toMatchObject({ cookingMethod: "pit", stillType: "clay-pot", extraction: "" });
    expect(withProduction({ cookingMethod: "autoclave", stillType: "column", extraction: "diffuser" }, "ancestral")).toMatchObject({ cookingMethod: "pit", stillType: "clay-pot", extraction: "" });
  });
  it("blanks only what an Artesanal rules out, and leaves a plain mezcal alone", () => {
    expect(withProduction({ stillType: "column", extraction: "tahona" }, "artesanal")).toMatchObject({ stillType: "", extraction: "tahona" });
    const same = { stillType: "column", extraction: "diffuser" };
    expect(withProduction(same, "mezcal")).toEqual(same);
    expect(withProduction(same, "")).toBe(same);
  });
});

describe("specForKind", () => {
  it("gives a gin its styles and a genever its classes, under the right name", () => {
    expect(values(specForKind(field("ginStyle"), "gin"))).toEqual(["", "London Dry", "Old Tom", "Contemporary", "Plymouth", "Holland-Style", "Other"]);
    const genever = specForKind(field("ginStyle"), "genever");
    expect(values(genever)).toEqual(["", "Jonge", "Oude", "Korenwijn"]);
    expect(genever.label).toBe("Genever Class");
  });
  it("gives mezcal a class with no Extra Añejo or Cristalino", () => {
    expect(values(specForKind(field("tequilaClass"), "mezcal"))).toEqual(["", "blanco", "joven", "reposado", "anejo", "madurado-en-vidrio"]);
    expect(values(specForKind(field("tequilaClass"), "tequila"))).toContain("extra-anejo");
    expect(values(specForKind(field("tequilaClass"), "tequila"))).not.toContain("madurado-en-vidrio");
  });
  it("gives each brandy its designations, with the minimum age", () => {
    expect(values(specForKind(field("brandyGrade"), "cognac"))).toEqual(["", "VS", "VSOP", "XO"]);
    expect(values(specForKind(field("brandyGrade"), "armagnac"))).toEqual(["", "Blanche", "VS", "VSOP", "Napoléon", "XO", "Hors d'Âge", "Millésime"]);
    const calvados = specForKind(field("brandyGrade"), "calvados");
    expect(values(calvados)).toEqual(["", "VS", "Vieux", "VSOP", "XO", "Millésime"]);
    expect(calvados.kind === "select" && calvados.options[1]!.label).toBe("Fine (VS) · 2+ years");
  });
  it("leaves every other field alone", () => {
    expect(specForKind(field("proof"), "gin")).toBe(field("proof"));
  });
});
