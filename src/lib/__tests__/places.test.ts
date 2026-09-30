import { describe, expect, it } from "vitest";
import { normalizeCountry, normalizePlace, normalizeState, samePlace, undisclosedName } from "../places";

describe("normalizeState", () => {
  it("expands abbreviations, in any case", () => {
    expect(normalizeState("NY")).toBe("New York");
    expect(normalizeState("ca")).toBe("California");
    expect(normalizeState(" ky ")).toBe("Kentucky");
  });

  it("puts a spelled-out state in its proper case", () => {
    expect(normalizeState("new york")).toBe("New York");
    expect(normalizeState("NORTH  CAROLINA")).toBe("North Carolina");
  });

  it("keeps anything it does not recognise, as typed", () => {
    expect(normalizeState("Atlantis")).toBe("Atlantis");
    expect(normalizeState("")).toBe("");
  });

  it("leaves a state in another country alone, even when it looks like one of ours", () => {
    expect(normalizeState("CA", "Canada")).toBe("CA");
    expect(normalizeState("NSW", "Australia")).toBe("NSW");
    expect(normalizeState("CA", "United States")).toBe("California");
  });
});

describe("normalizeCountry", () => {
  it("folds the usual spellings of the US into USA, and blank too", () => {
    for (const value of ["us", "U.S.A.", "United States", "united states of america", "", "  "]) {
      expect(normalizeCountry(value)).toBe("USA");
    }
  });

  it("keeps other countries as typed", () => {
    expect(normalizeCountry(" Scotland ")).toBe("Scotland");
  });
});

describe("undisclosedName", () => {
  it("names a US state without repeating the country", () => {
    expect(undisclosedName(normalizePlace({ state: "IN" }))).toBe("Undisclosed (Indiana)");
    expect(undisclosedName(normalizePlace({ city: "Louisville", state: "ky" }))).toBe("Undisclosed (Louisville, Kentucky)");
  });

  it("shows the country when it is not the US, or when it is all there is", () => {
    expect(undisclosedName(normalizePlace({ country: "Scotland" }))).toBe("Undisclosed (Scotland)");
    expect(undisclosedName(normalizePlace({ city: "Lynchburg", state: "TN", country: "Canada" }))).toBe(
      "Undisclosed (Lynchburg, TN, Canada)",
    );
    expect(undisclosedName(normalizePlace({}))).toBe("Undisclosed (USA)");
  });
});

describe("samePlace", () => {
  it("treats every spelling of one place as one place", () => {
    const a = normalizePlace({ state: "NY" });
    expect(samePlace(a, normalizePlace({ state: "new york", country: "us" }))).toBe(true);
    expect(samePlace(a, normalizePlace({ state: "New Jersey" }))).toBe(false);
    expect(samePlace(normalizePlace({ city: "Albany", state: "NY" }), a)).toBe(false);
  });
});
