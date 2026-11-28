import { describe, expect, it } from "vitest";
import { vintageDefaultsNote } from "../vintage-defaults";

const money = (value: string) => `$${value}`;

describe("vintageDefaultsNote", () => {
  it("names the label's proof, age and MSRP", () => {
    expect(vintageDefaultsNote({ proof: "100", ageYears: "7", ageMonths: "2", msrp: "54.99" }, money)).toBe("A blank box uses the label's: 100 proof · 7 years 2 months · $54.99 MSRP.");
  });
  it("says NAS, or the statement, when there is no age", () => {
    expect(vintageDefaultsNote({ proof: "92", isNas: true }, money)).toContain("NAS");
    expect(vintageDefaultsNote({ ageStatement: "8–16 years" }, money)).toBe("A blank box uses the label's: 8–16 years.");
  });
  it("singular units, and nothing at all for a label with none of them", () => {
    expect(vintageDefaultsNote({ ageYears: "1" }, money)).toContain("1 year.");
    expect(vintageDefaultsNote({ proof: "", ageYears: "", msrp: null }, money)).toBeNull();
  });
});
