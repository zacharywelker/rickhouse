import { describe, expect, it } from "vitest";
import { FAMILIES, INGREDIENT_KIND_LABELS, ingredientHref, isIngredientKind, lockFor, reservedNameError } from "../ingredient-rules";

describe("lockFor", () => {
  it("locks a preset name as Built-in, which blocks rename but not delete", () => {
    expect(lockFor({ kind: "botanical", name: "juniper", styleLinks: 0 })).toMatchObject({ tag: "Built-in", allowDelete: true });
  });

  it("locks a row with a style-derived link as Fixed, even when it is not a preset", () => {
    expect(lockFor({ kind: "botanical", name: "Wormwood", styleLinks: 1 })).toMatchObject({ tag: "Fixed", allowDelete: false });
  });

  it("prefers Fixed when both apply", () => {
    expect(lockFor({ kind: "botanical", name: "Juniper", styleLinks: 2 })?.tag).toBe("Fixed");
  });

  it("leaves an ordinary custom row editable, so Wormwood on a gin is not locked", () => {
    expect(lockFor({ kind: "botanical", name: "Wormwood", styleLinks: 0 })).toBeNull();
  });
});

describe("reservedNameError", () => {
  it("names the canonical spelling for a preset of that kind", () => {
    expect(reservedNameError("rum_base", "sugarcane")).toBe("Sugarcane is a built-in choice. Pick Sugarcane on the label itself instead.");
  });

  it("allows a name that is a preset only of another kind", () => {
    expect(reservedNameError("flavor", "Sugarcane")).toBeNull();
  });
});

describe("isIngredientKind", () => {
  it("accepts all eight kinds and nothing else", () => {
    expect(Object.keys(INGREDIENT_KIND_LABELS)).toHaveLength(8);
    for (const kind of Object.keys(INGREDIENT_KIND_LABELS)) expect(isIngredientKind(kind)).toBe(true);
    for (const bad of ["", "gin", "toString", "__proto__", null, undefined, 3]) expect(isIngredientKind(bad)).toBe(false);
  });
});

it("offers the four families and links chips by id", () => {
  expect([...FAMILIES]).toEqual(["grape", "apple", "pear", "other"]);
  expect(ingredientHref({ id: 12 })).toBe("/ingredients/12");
});
