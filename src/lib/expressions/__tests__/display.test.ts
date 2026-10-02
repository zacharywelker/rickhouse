import { describe, expect, it } from "vitest";
import { ageLabel, describeAgeParts } from "../display";

describe("describeAgeParts", () => {
  it.each([
    [["12.0", null, null], "12y"],
    [["4.0", 3, null], "4y 3m"],
    [["10", "2", "14"], "10y 2m 14d"],
    [[null, 0, 45], "45d"],
    [[null, null, null], null],
  ] as const)("%j -> %s", ([years, months, days], expected) => {
    expect(describeAgeParts(years, months, days)).toBe(expected);
  });
});

describe("ageLabel", () => {
  const none = { ageStatement: null, ageYears: null, ageMonths: null, ageDays: null };

  it("prefers the years, months and days over the statement", () => {
    expect(ageLabel({ ...none, ageStatement: "Straight (at least 2 years)", ageYears: "4.0", ageMonths: 6 })).toBe("4y 6m");
    expect(ageLabel({ ...none, ageStatement: "7 Year", ageDays: 120 })).toBe("120d");
  });

  it("falls back to the statement when no part is recorded", () => {
    expect(ageLabel({ ...none, ageStatement: "NAS" })).toBe("NAS");
    // A zero age is no age at all.
    expect(ageLabel({ ...none, ageStatement: "NAS", ageYears: "0", ageMonths: 0, ageDays: 0 })).toBe("NAS");
  });

  it("is null when there is nothing to say", () => {
    expect(ageLabel(none)).toBeNull();
    expect(ageLabel({ ...none, ageStatement: "" })).toBeNull();
  });
});
