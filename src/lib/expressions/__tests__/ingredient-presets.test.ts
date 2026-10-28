import { describe, expect, it } from "vitest";
import { GIN_BASES as ginBasesFromGin, GIN_BOTANICALS as botanicalsFromGin } from "../gin-details";
import { GIN_BASES, GIN_BOTANICALS, INGREDIENT_PRESETS, isPreset, presetFor } from "../ingredient-presets";

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

  it("is still exported from gin-details with the same contents", () => {
    expect(ginBasesFromGin).toBe(GIN_BASES);
    expect(botanicalsFromGin).toBe(GIN_BOTANICALS);
  });
});
