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
