import { describe, expect, it } from "vitest";
import { ingredientSchema } from "../schemas";

const input = (over: Record<string, string> = {}) => ({ name: "Palm Sugar", kind: "rum_base", family: "", ...over });

describe("ingredientSchema", () => {
  it("accepts a rum base without a family", () => {
    const parsed = ingredientSchema.safeParse(input());
    expect(parsed.success && parsed.data).toEqual({ name: "Palm Sugar", kind: "rum_base", family: null });
  });

  it("trims the name and rejects an empty or overlong one", () => {
    const trimmed = ingredientSchema.safeParse(input({ name: "  Palm Sugar  " }));
    expect(trimmed.success && trimmed.data.name).toBe("Palm Sugar");
    expect(ingredientSchema.safeParse(input({ name: "   " })).success).toBe(false);
    expect(ingredientSchema.safeParse(input({ name: "x".repeat(121) })).success).toBe(false);
  });

  it("requires a family for a distillate, pointing at the family field", () => {
    const parsed = ingredientSchema.safeParse(input({ kind: "distillate", name: "Muscat" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path[0]).toBe("family");
  });

  it("accepts each family for a distillate", () => {
    for (const family of ["grape", "apple", "pear", "other"]) {
      const parsed = ingredientSchema.safeParse(input({ kind: "distillate", name: "Muscat", family }));
      expect(parsed.success && parsed.data.family).toBe(family);
    }
  });

  it("drops a stray family on any other kind", () => {
    const parsed = ingredientSchema.safeParse(input({ kind: "botanical", family: "grape" }));
    expect(parsed.success && parsed.data.family).toBeNull();
  });

  it("rejects an unknown or missing kind", () => {
    expect(ingredientSchema.safeParse(input({ kind: "whiskey_base" })).success).toBe(false);
    expect(ingredientSchema.safeParse({ name: "Palm Sugar" }).success).toBe(false);
  });

  it("treats an absent family as blank", () => {
    expect(ingredientSchema.safeParse({ name: "Palm Sugar", kind: "rum_base" }).success).toBe(true);
  });
});
