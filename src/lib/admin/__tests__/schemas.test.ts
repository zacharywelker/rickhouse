import { describe, expect, it } from "vitest";
import { brandSchema, distillerySchema, mashbillSchema, tagSchema } from "../schemas";

/** FormData always hands us strings, so the schemas are fed the same way. */
const mashbill = (over: Record<string, string> = {}) => ({
  name: "",
  corn: "0",
  rye: "0",
  wheat: "0",
  maltedBarley: "0",
  maltedRye: "0",
  otherGrain: "0",
  otherGrainName: "",
  distilleryId: "",
  notes: "",
  ...over,
});

describe("mashbillSchema", () => {
  it("accepts the Pursuit reference recipe", () => {
    const parsed = mashbillSchema.safeParse(mashbill({ corn: "78", rye: "10", maltedBarley: "12" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.corn).toBe(78);
      expect(parsed.data.name).toBeNull();
    }
  });

  it("rejects grains that do not add up", () => {
    const parsed = mashbillSchema.safeParse(mashbill({ corn: "70", rye: "10" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("80");
    }
  });

  it("allows the rounding tolerance the database allows", () => {
    // Published mashbills are often rounded; 99-101 matches the check constraint.
    expect(mashbillSchema.safeParse(mashbill({ corn: "79", rye: "10", maltedBarley: "12" })).success).toBe(true);
    expect(mashbillSchema.safeParse(mashbill({ corn: "77", rye: "10", maltedBarley: "12" })).success).toBe(true);
    expect(mashbillSchema.safeParse(mashbill({ corn: "80", rye: "10", maltedBarley: "12" })).success).toBe(false);
  });

  it("insists on naming the other grain when it is used", () => {
    const parsed = mashbillSchema.safeParse(mashbill({ corn: "90", otherGrain: "10" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === "otherGrainName")).toBe(true);
    }
  });

  it("accepts a named other grain", () => {
    expect(mashbillSchema.safeParse(mashbill({ corn: "90", otherGrain: "10", otherGrainName: "Oats" })).success).toBe(
      true,
    );
  });

  it("rejects a negative percentage", () => {
    expect(mashbillSchema.safeParse(mashbill({ corn: "110", rye: "-10" })).success).toBe(false);
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
