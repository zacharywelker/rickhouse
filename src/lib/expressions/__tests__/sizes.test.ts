import { describe, expect, it } from "vitest";
import { formatSize, SIZE_PRESETS } from "../sizes";
import { bottleSchema, expressionSchema } from "../schema";

describe("sizes", () => {
  it("offers the usual sizes smallest first", () => {
    expect(SIZE_PRESETS).toEqual([200, 375, 500, 700, 750, 1000]);
  });

  it("writes litres as litres and the rest as mL", () => {
    expect(formatSize(750)).toBe("750 mL");
    expect(formatSize(1000)).toBe("1 L");
    expect(formatSize(1750)).toBe("1.75 L");
    expect(formatSize(1100)).toBe("1100 mL");
  });

  it("takes whole numbers only, on the label and on the bottle", () => {
    const label = { brandId: "1", categoryId: "2", name: "X" };
    expect(expressionSchema.parse({ ...label, sizeMl: "375" }).sizeMl).toBe(375);
    expect(expressionSchema.safeParse({ ...label, sizeMl: "37.5" }).success).toBe(false);
    const bottle = { expressionId: "1", acquisition: "purchase", status: "owned" };
    expect(bottleSchema.parse({ ...bottle, sizeMl: "" }).sizeMl).toBeNull();
    expect(bottleSchema.parse({ ...bottle, sizeMl: "200" }).sizeMl).toBe(200);
    expect(bottleSchema.safeParse({ ...bottle, sizeMl: "0.5" }).success).toBe(false);
  });
});
