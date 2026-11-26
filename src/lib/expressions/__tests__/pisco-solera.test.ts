import { describe, expect, it } from "vitest";
import { appellationNote } from "../derived-designation";
import { ingredientAllowed, piscoCountry, piscoStyle, soleraText } from "../spirit-details";
import { fruitFamily } from "../ingredient-presets";

describe("soleraText", () => {
  it("writes the ages as a range", () => {
    expect(soleraText("5.0", "12.0")).toBe("5–12 years");
    expect(soleraText(8, 8)).toBe("8 years");
    expect(soleraText("5", null)).toBe("from 5 years");
    expect(soleraText(null, "12")).toBe("up to 12 years");
    expect(soleraText(null, "")).toBeNull();
  });
});

describe("pisco", () => {
  it("takes its country from the distilleries, only when they agree on Peru or Chile", () => {
    expect(piscoCountry(["Peru"])).toBe("Peru");
    expect(piscoCountry(["Perú", "peru"])).toBe("Peru");
    expect(piscoCountry(["Chile"])).toBe("Chile");
    expect(piscoCountry(["Peru", "Chile"])).toBeNull();
    expect(piscoCountry([])).toBeNull();
    expect(piscoCountry([undefined, "France"])).toBeNull();
  });
  it("is a Puro or an Acholado in Peru, by its grapes", () => {
    expect(piscoStyle("Peru", 0, 40)).toBeNull();
    expect(piscoStyle("Peru", 1, 40)).toBe("Puro");
    expect(piscoStyle("Peru", 3, 40)).toBe("Acholado");
  });
  it("has a class from its ABV in Chile and never an Acholado", () => {
    expect(piscoStyle("Chile", 3, 29)).toBeNull();
    expect(piscoStyle("Chile", 3, 30)).toBe("Tradicional");
    expect(piscoStyle("Chile", 1, 35)).toBe("Especial");
    expect(piscoStyle("Chile", 1, 40)).toBe("Reservado");
    expect(piscoStyle("Chile", 1, 43)).toBe("Gran Pisco");
    expect(piscoStyle("Chile", 1, null)).toBeNull();
    expect(piscoStyle(null, 2, 40)).toBeNull();
  });
  it("is made from grapes only", () => {
    expect(fruitFamily("pisco", "Quebranta")).toBe("grape");
    expect(fruitFamily("pisco", "Moscatel de Alejandría")).toBe("grape");
    expect(ingredientAllowed("pisco", { name: "Quebranta", kind: "distillate", family: "grape" })).toBe(true);
    expect(ingredientAllowed("pisco", { name: "Apple", kind: "distillate", family: "apple" })).toBe(false);
  });
});

describe("appellationNote", () => {
  it("warns, never blocks, where the label disagrees with its appellation", () => {
    expect(appellationNote({ calvadosAppellation: "pays-d-auge", stillType: "column" })).toBe("Pays d'Auge is distilled in a pot still.");
    expect(appellationNote({ calvadosAppellation: "pays-d-auge", stillType: "pot" })).toBeNull();
    expect(appellationNote({ calvadosAppellation: "domfrontais", stillType: "pot" })).toBe("Domfrontais is distilled in a column still.");
    expect(appellationNote({ calvadosAppellation: "domfrontais", stillType: "column", ageYears: "2" })).toBe("Domfrontais is aged at least 3 years.");
    expect(appellationNote({ calvadosAppellation: "domfrontais", stillType: "column", ageYears: "3" })).toBeNull();
    expect(appellationNote({ calvadosAppellation: "aoc-calvados", stillType: "pot" })).toBeNull();
    expect(appellationNote({})).toBeNull();
  });
});
