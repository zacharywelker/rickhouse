import { describe, expect, it } from "vitest";
import { hiddenFields, type FormContext } from "../rules";
import { fixedIngredient, ingredientAllowed, stillForCountry } from "../spirit-details";

const rum = (kind: FormContext["kind"], values: Record<string, unknown> = {}): FormContext => ({ group: "rum", kind, values, ginAged: false });

describe("the base of a Rhum Agricole and a Cachaça", () => {
  it("is fixed as sugarcane juice, as tequila's is Blue Weber", () => {
    expect(fixedIngredient("agricole")).toEqual({ name: "Sugarcane juice", kind: "rum_base" });
    expect(fixedIngredient("cachaca")).toEqual({ name: "Sugarcane juice", kind: "rum_base" });
    expect(fixedIngredient("tequila")).toEqual({ name: "Blue Weber", kind: "maguey" });
    expect(fixedIngredient("spiced-rum")).toBeNull();
    expect(fixedIngredient("other")).toBeNull();
  });
  it("lets no other base through for them, and any for a plain rum", () => {
    expect(ingredientAllowed("agricole", { name: "Molasses", kind: "rum_base" })).toBe(false);
    expect(ingredientAllowed("cachaca", { name: "sugarcane JUICE", kind: "rum_base" })).toBe(true);
    expect(ingredientAllowed("tequila", { name: "Agave", kind: "maguey" })).toBe(false);
    expect(ingredientAllowed("other", { name: "Molasses", kind: "rum_base" })).toBe(true);
  });
  it("lets a spiced rum's flavor through next to a base", () => {
    expect(ingredientAllowed("spiced-rum", { name: "Vanilla", kind: "flavor" })).toBe(true);
  });
});

describe("Added sugar", () => {
  it("is not for a Rhum Agricole, and stays for a Cachaça, a spiced rum and any other rum", () => {
    expect(hiddenFields(rum("agricole")).has("sugarGPerL")).toBe(true);
    for (const kind of ["cachaca", "spiced-rum", "other"] as const) expect(hiddenFields(rum(kind)).has("sugarGPerL"), kind).toBe(false);
  });
});

describe("a Martinique distillery", () => {
  it("pre-selects the column still", () => {
    expect(stillForCountry("Martinique")).toBe("column");
    expect(stillForCountry("martinique")).toBe("column");
    expect(stillForCountry("France")).toBeNull();
    expect(stillForCountry(undefined)).toBeNull();
  });
});

describe("what a mezcal's production offers can be saved", () => {
  const shape = { brandId: "1", categoryId: "2", name: "X" };
  it("accepts every cooking and extraction method the form offers, and the new still", async () => {
    const { expressionSchema } = await import("../schema");
    const { COOKING_METHODS, EXTRACTION_METHODS } = await import("../spirit-details");
    for (const cookingMethod of COOKING_METHODS) expect(expressionSchema.safeParse({ ...shape, cookingMethod }).success, cookingMethod).toBe(true);
    for (const extraction of EXTRACTION_METHODS) expect(expressionSchema.safeParse({ ...shape, extraction }).success, extraction).toBe(true);
    expect(expressionSchema.safeParse({ ...shape, stillType: "clay-pot" }).success).toBe(true);
    expect(expressionSchema.safeParse({ ...shape, extraction: "steam" }).success).toBe(false);
  });
  it("does not let a tequila bottle keep Madurado en Vidrio", async () => {
    const { withBottleSpiritFacts } = await import("../spirit-details");
    expect(withBottleSpiritFacts({ tequilaClass: "madurado-en-vidrio" }, "tequila", false, "agave")).toMatchObject({ tequilaClass: null, ageStatement: null });
    expect(withBottleSpiritFacts({ tequilaClass: "madurado-en-vidrio" }, "mezcal", false, "agave")).toMatchObject({ tequilaClass: "madurado-en-vidrio" });
  });
});
