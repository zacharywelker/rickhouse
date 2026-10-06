import { describe, expect, it } from "vitest";
import { expressionSchema } from "@/lib/expressions/schema";
import { newLabelSchema, normalizeUpc, upcCandidates } from "../labels";

describe("normalizeUpc", () => {
  it("keeps digits and drops spaces and dashes", () => {
    expect(normalizeUpc("0 81128-01234 5")).toBe("081128012345");
  });

  it("rejects anything that is not 6 to 32 digits", () => {
    expect(normalizeUpc("12345")).toBeNull();
    expect(normalizeUpc("12345a")).toBeNull();
    expect(normalizeUpc("")).toBeNull();
    expect(normalizeUpc(null)).toBeNull();
    expect(normalizeUpc("1".repeat(33))).toBeNull();
  });
});

describe("upcCandidates", () => {
  it("pairs a UPC-A with its EAN-13", () => {
    expect(upcCandidates("081128012345").sort()).toEqual(["0081128012345", "081128012345"]);
    expect(upcCandidates("0081128012345").sort()).toEqual(["0081128012345", "081128012345"]);
  });

  it("leaves other lengths and non-zero EAN-13s alone", () => {
    expect(upcCandidates("12345678")).toEqual(["12345678"]);
    expect(upcCandidates("5000299225004")).toEqual(["5000299225004"]);
  });
});

describe("newLabelSchema", () => {
  it("accepts the minimal body and coerces the category", () => {
    const parsed = newLabelSchema.parse({ brand: "  Pinhook ", name: "Vertical Series", categoryId: "7", upc: "081128012345" });
    expect(parsed).toEqual({ brand: "Pinhook", name: "Vertical Series", categoryId: 7, upc: "081128012345" });
  });

  it("treats a missing or blank barcode as none", () => {
    expect(newLabelSchema.parse({ brand: "A", name: "B", categoryId: 1 }).upc).toBeNull();
    expect(newLabelSchema.parse({ brand: "A", name: "B", categoryId: 1, upc: "  " }).upc).toBeNull();
  });

  it("names the field that is wrong", () => {
    const result = newLabelSchema.safeParse({ brand: " ", name: "", categoryId: "x", upc: "12" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["brand", "name", "categoryId", "upc"]));
  });
});

describe("a new label through the web label schema", () => {
  it("passes with only a brand, a category, a name and a barcode", () => {
    const parsed = expressionSchema.safeParse({ brandId: 3, categoryId: 7, name: "Vertical Series", upc: "081128012345" });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.upc).toBe("081128012345");
  });
});
