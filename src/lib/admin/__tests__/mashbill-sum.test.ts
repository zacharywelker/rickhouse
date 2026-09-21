import { describe, expect, it } from "vitest";
import { sumGrains } from "@/components/admin/mashbill-sum";

describe("sumGrains", () => {
  const empty = { corn: "", rye: "", wheat: "", maltedBarley: "", maltedRye: "", otherGrain: "" };

  it("is zero for an empty form", () => {
    expect(sumGrains(empty)).toBe(0);
  });

  it("adds the reference recipe to 100", () => {
    expect(sumGrains({ ...empty, corn: "78", rye: "10", maltedBarley: "12" })).toBe(100);
  });

  it("treats blanks and junk as zero rather than NaN", () => {
    expect(sumGrains({ ...empty, corn: "80", rye: "abc", wheat: "" })).toBe(80);
  });

  it("handles decimals", () => {
    expect(sumGrains({ ...empty, corn: "51.5", rye: "48.5" })).toBeCloseTo(100, 5);
  });

  it("ignores unrelated keys", () => {
    expect(sumGrains({ ...empty, corn: "100", name: "BBC", distilleryId: "3" })).toBe(100);
  });
});
