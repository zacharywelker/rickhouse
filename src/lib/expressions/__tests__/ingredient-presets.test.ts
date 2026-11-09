import { describe, expect, it } from "vitest";
import { GIN_BASES as ginBasesFromGin, GIN_BOTANICALS as botanicalsFromGin } from "../gin-details";
import { BRANDY_FRUITS, FRUIT_FAMILY_EXCEPTIONS, fruitFamily, GIN_BASES, GIN_BOTANICALS, INGREDIENT_PRESETS, isPreset, presetFor } from "../ingredient-presets";

describe("ingredient presets", () => {
  it("has no case-insensitive duplicates within a kind", () => {
    for (const [kind, names] of Object.entries(INGREDIENT_PRESETS)) {
      const lowered = (names ?? []).map((name) => name.toLocaleLowerCase());
      expect(new Set(lowered).size, kind).toBe(lowered.length);
    }
  });

  it("keeps Juniper and Blue Weber as built-ins", () => {
    expect(isPreset("botanical", "Juniper")).toBe(true);
    expect(isPreset("maguey", "Blue Weber")).toBe(true);
  });

  it("matches regardless of case and surrounding space, and returns the canonical spelling", () => {
    expect(presetFor("rum_base", "  molasses ")).toBe("Molasses");
    expect(presetFor("gin_base", "WHEAT")).toBe("Wheat");
  });

  it("never matches a kind that has no presets, or a name from another kind", () => {
    expect(isPreset("flavor", "Wheat")).toBe(false);
    expect(isPreset("rum_base", "Wheat")).toBe(false);
  });

  it("gives each base fruit its own family, so one label can mix families", () => {
    expect(fruitFamily("brandy", "apricot")).toBe("other");
    expect(fruitFamily("brandy", "Ugni Blanc")).toBe("grape");
    expect(fruitFamily("brandy", "Williams Pear")).toBe("pear");
    expect(fruitFamily("brandy", "Some Unlisted Grape Pomace")).toBe("grape");
    expect(fruitFamily("brandy", "Dragonfruit")).toBe("other");
  });

  it("lets an unlisted fruit follow the category where the category fixes the family", () => {
    expect(fruitFamily("cognac", "Saint-Émilion")).toBe("grape");
    expect(fruitFamily("calvados", "Domaine Perry Poire")).toBe("pear");
    expect(fruitFamily("calvados", "Bitter Sweet")).toBe("apple");
    // A listed non-grape fruit keeps its family so the category rule can reject it.
    expect(fruitFamily("cognac", "Apple")).toBe("apple");
    expect(fruitFamily("calvados", "Cherry")).toBe("other");
  });

  it("does not read one fruit's name inside another's", () => {
    expect(fruitFamily("brandy", "Pineapple")).toBe("other");
    expect(fruitFamily("brandy", "Grapefruit")).toBe("other");
    expect(fruitFamily("brandy", "Prickly Pear")).toBe("other");
    expect(fruitFamily("brandy", "Crabapple")).toBe("apple");
    // The exceptions beat the category default too, so the category rule can reject the fruit.
    expect(fruitFamily("cognac", "Grapefruit")).toBe("other");
    expect(fruitFamily("calvados", "Pineapple")).toBe("other");
  });

  it("names the fruit before the pressing", () => {
    expect(fruitFamily("brandy", "Apple Pomace")).toBe("apple");
    expect(fruitFamily("brandy", "Pear Pomace")).toBe("pear");
    expect(fruitFamily("brandy", "Pomace")).toBe("grape");
    expect(fruitFamily("brandy", "Marc de Bourgogne")).toBe("grape");
  });

  it("has no fruit listed both as a preset and an exception", () => {
    const presets = new Set(Object.keys(BRANDY_FRUITS).map((name) => name.toLocaleLowerCase()));
    for (const name of Object.keys(FRUIT_FAMILY_EXCEPTIONS)) expect(presets.has(name.toLocaleLowerCase()), name).toBe(false);
  });

  it("has no case-insensitive duplicate fruits", () => {
    const lowered = Object.keys(BRANDY_FRUITS).map((name) => name.toLocaleLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("is still exported from gin-details with the same contents", () => {
    expect(ginBasesFromGin).toBe(GIN_BASES);
    expect(botanicalsFromGin).toBe(GIN_BOTANICALS);
  });
});
