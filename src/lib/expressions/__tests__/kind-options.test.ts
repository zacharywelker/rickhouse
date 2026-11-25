import { describe, expect, it } from "vitest";
import { EXPRESSION_SECTIONS } from "../fields";
import { specForKind } from "../kind-options";

const field = (name: string) => EXPRESSION_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === name)!;
const values = (spec: ReturnType<typeof field>) => (spec.kind === "select" ? spec.options.map((o) => o.value) : []);

describe("specForKind", () => {
  it("gives a gin its styles and a genever its classes, under the right name", () => {
    expect(values(specForKind(field("ginStyle"), "gin"))).toEqual(["", "London Dry", "Old Tom", "Contemporary", "Plymouth", "Holland-Style", "Other"]);
    const genever = specForKind(field("ginStyle"), "genever");
    expect(values(genever)).toEqual(["", "Jonge", "Oude", "Korenwijn"]);
    expect(genever.label).toBe("Genever Class");
  });
  it("gives mezcal a class with no Extra Añejo or Cristalino", () => {
    expect(values(specForKind(field("tequilaClass"), "mezcal"))).toEqual(["", "blanco", "joven", "reposado", "anejo"]);
    expect(values(specForKind(field("tequilaClass"), "tequila"))).toContain("extra-anejo");
  });
  it("gives each brandy its designations, with the minimum age", () => {
    expect(values(specForKind(field("brandyGrade"), "cognac"))).toEqual(["", "VS", "VSOP", "XO"]);
    expect(values(specForKind(field("brandyGrade"), "armagnac"))).toEqual(["", "VS", "VSOP", "Napoléon", "XO", "Hors d'Âge"]);
    const calvados = specForKind(field("brandyGrade"), "calvados");
    expect(values(calvados)).toEqual(["", "VS", "Vieux", "VSOP", "XO"]);
    expect(calvados.kind === "select" && calvados.options[1]!.label).toBe("Fine (VS) · 2+ years");
  });
  it("leaves every other field alone", () => {
    expect(specForKind(field("proof"), "gin")).toBe(field("proof"));
  });
});
