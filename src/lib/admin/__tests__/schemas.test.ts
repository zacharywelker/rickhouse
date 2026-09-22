import { describe, expect, it } from "vitest";
import { brandSchema, distillerySchema, mashbillSchema, tagSchema } from "../schemas";

/** FormData always hands us strings, so the schemas are fed the same way. */
const mashbill = (grains: Array<[string, string]> = [], over: Record<string, string> = {}) => ({
  name: "",
  notes: "",
  // The grain editor serialises its rows into one hidden field.
  grains: JSON.stringify(grains.map(([grain, percent]) => ({ grain, percent }))),
  ...over,
});

describe("mashbillSchema", () => {
  it("accepts the Pursuit reference recipe", () => {
    const parsed = mashbillSchema.safeParse(
      mashbill([["Corn", "78"], ["Rye", "10"], ["Malted Barley", "12"]]),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.grains).toHaveLength(3);
      expect(parsed.data.grains[0]).toEqual({ grain: "Corn", percent: 78 });
      expect(parsed.data.name).toBeNull();
    }
  });

  it("rejects grains that do not add up", () => {
    const parsed = mashbillSchema.safeParse(mashbill([["Corn", "70"], ["Rye", "10"]]));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("80");
    }
  });

  it("allows the rounding tolerance the database allows", () => {
    // Published mashbills are often rounded; 99-101 matches the trigger.
    expect(mashbillSchema.safeParse(mashbill([["Corn", "79"], ["Rye", "10"], ["Malted Barley", "12"]])).success).toBe(true);
    expect(mashbillSchema.safeParse(mashbill([["Corn", "77"], ["Rye", "10"], ["Malted Barley", "12"]])).success).toBe(true);
    expect(mashbillSchema.safeParse(mashbill([["Corn", "80"], ["Rye", "10"], ["Malted Barley", "12"]])).success).toBe(false);
  });

  it("takes any grain, which is the point of the child table", () => {
    const parsed = mashbillSchema.safeParse(
      mashbill([["Corn", "60"], ["Oats", "20"], ["Triticale", "10"], ["Malted Barley", "10"]]),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.grains.map((g) => g.grain)).toContain("Triticale");
    }
  });

  it("refuses the same grain twice rather than silently adding them", () => {
    const parsed = mashbillSchema.safeParse(mashbill([["Corn", "50"], ["corn", "50"]]));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("twice");
    }
  });

  it("allows a recipe with no grains at all", () => {
    // A mashbill you know the name of but not the contents is a real thing.
    expect(mashbillSchema.safeParse(mashbill([], { name: "Unknown high rye" })).success).toBe(true);
  });

  it("rejects a grain with no name, and a percentage of zero", () => {
    expect(mashbillSchema.safeParse(mashbill([["", "100"]])).success).toBe(false);
    expect(mashbillSchema.safeParse(mashbill([["Corn", "100"], ["Rye", "0"]])).success).toBe(false);
  });

  it("rejects a negative percentage", () => {
    expect(mashbillSchema.safeParse(mashbill([["Corn", "110"], ["Rye", "-10"]])).success).toBe(false);
  });

  it("survives a grains field that is not JSON at all", () => {
    expect(mashbillSchema.safeParse(mashbill([], { grains: "not json" })).success).toBe(false);
  });
});

describe("brandSchema", () => {
  it("reads an absent checkbox as false", () => {
    const parsed = brandSchema.safeParse({ name: "Pursuit Spirits", slug: "", companyId: "", notes: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isNdp).toBe(false);
  });

  it("reads a checked box as true", () => {
    const parsed = brandSchema.safeParse({ name: "Pursuit Spirits", slug: "", companyId: "", isNdp: "on", notes: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isNdp).toBe(true);
  });

  it("turns blank optional references into null, not zero", () => {
    const parsed = brandSchema.safeParse({ name: "Weller", slug: "", companyId: "", notes: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.companyId).toBeNull();
  });

  it("requires a name", () => {
    expect(brandSchema.safeParse({ name: "   ", slug: "", companyId: "", notes: "" }).success).toBe(false);
  });

  it("leaves a blank slug null so one gets generated", () => {
    const parsed = brandSchema.safeParse({ name: "Weller", slug: "", companyId: "", notes: "" });
    if (parsed.success) expect(parsed.data.slug).toBeNull();
  });

  it("rejects a slug with spaces or capitals", () => {
    expect(brandSchema.safeParse({ name: "Weller", slug: "Old Weller", companyId: "", notes: "" }).success).toBe(false);
    expect(brandSchema.safeParse({ name: "Weller", slug: "old-weller", companyId: "", notes: "" }).success).toBe(true);
  });
});

describe("distillerySchema", () => {
  const base = {
    name: "Bardstown Bourbon Company",
    slug: "",
    companyId: "",
    city: "",
    state: "KY",
    country: "USA",
    dspNumber: "",
    founded: "",
    notes: "",
  };

  it("accepts a distillery with no founding year", () => {
    const parsed = distillerySchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.founded).toBeNull();
  });

  it("rejects an implausible founding year", () => {
    expect(distillerySchema.safeParse({ ...base, founded: "1200" }).success).toBe(false);
    expect(distillerySchema.safeParse({ ...base, founded: "2014" }).success).toBe(true);
  });

  it("requires a country, since the column is NOT NULL", () => {
    expect(distillerySchema.safeParse({ ...base, country: "" }).success).toBe(false);
  });
});

describe("tagSchema", () => {
  it("accepts a hex colour or none at all", () => {
    expect(tagSchema.safeParse({ name: "Dusty", slug: "", color: "#b5651d" }).success).toBe(true);
    const blank = tagSchema.safeParse({ name: "Dusty", slug: "", color: "" });
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.color).toBeNull();
  });

  it("rejects a colour that is not hex", () => {
    expect(tagSchema.safeParse({ name: "Dusty", slug: "", color: "burnt orange" }).success).toBe(false);
  });
});

describe("optional fields when the key is absent entirely", () => {
  // The inline "create new" path submits a name and nothing else, so the
  // schemas have to tolerate missing optional keys, not just empty strings.
  it("accepts a distillery built from just a name and country", () => {
    const parsed = distillerySchema.safeParse({ name: "Inline Distillery", country: "USA" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.slug).toBeNull();
      expect(parsed.data.companyId).toBeNull();
      expect(parsed.data.founded).toBeNull();
      expect(parsed.data.notes).toBeNull();
    }
  });

  it("accepts a brand built from just a name", () => {
    const parsed = brandSchema.safeParse({ name: "Inline Brand" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isNdp).toBe(false);
  });

  it("accepts a tag built from just a name", () => {
    const parsed = tagSchema.safeParse({ name: "Dusty" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.color).toBeNull();
  });

  it("still rejects a missing name", () => {
    expect(brandSchema.safeParse({}).success).toBe(false);
  });
});
