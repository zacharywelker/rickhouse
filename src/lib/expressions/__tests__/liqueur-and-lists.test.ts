import { describe, expect, it } from "vitest";
import { EXPRESSION_SECTIONS } from "../fields";
import { SHOCHU_BASES } from "../ingredient-presets";
import { dairyDefault, effectiveDairy, fixedIngredient, ingredientAllowed } from "../spirit-details";

describe("a liqueur's dairy", () => {
  it("starts dairy on a cream liqueur and non-dairy on the others", () => {
    expect(dairyDefault("cream-liqueur")).toBe("dairy");
    expect(dairyDefault("chocolate-liqueur")).toBe("non-dairy");
    expect(dairyDefault("liqueur")).toBe("non-dairy");
  });
  it("keeps what is stated and never leaves it unknown", () => {
    expect(effectiveDairy("liqueur", "dairy")).toBe("dairy");
    expect(effectiveDairy("cream-liqueur", "non-dairy")).toBe("non-dairy");
    expect(effectiveDairy("cream-liqueur", "unknown")).toBe("dairy");
    expect(effectiveDairy("liqueur", undefined)).toBe("non-dairy");
    expect(effectiveDairy("liqueur", "")).toBe("non-dairy");
  });
  it("offers only Dairy and Non-dairy in the form", () => {
    const field = EXPRESSION_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === "dairyStatus")!;
    expect(field.kind === "select" && field.options.map((o) => o.value)).toEqual(["dairy", "non-dairy"]);
  });
});

describe("apple brandy and the other lists", () => {
  it("has its fruit fixed as Apple", () => {
    expect(fixedIngredient("apple")).toEqual({ name: "Apple", kind: "distillate", family: "apple" });
    expect(ingredientAllowed("apple", { name: "Pear", kind: "distillate", family: "pear" })).toBe(false);
    expect(ingredientAllowed("apple", { name: "apple", kind: "distillate" })).toBe(true);
    expect(ingredientAllowed("eau-de-vie", { name: "Pear", kind: "distillate", family: "pear" })).toBe(true);
  });
  it("gives shochu its three bases", () => {
    expect([...SHOCHU_BASES]).toEqual(["Sweet potato", "Barley", "Rice"]);
  });
});
