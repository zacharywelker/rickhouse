import { describe, expect, it } from "vitest";
import { derivedAge, hasAge } from "../age-derive";

describe("the age a whiskey's statement fills in", () => {
  it("takes the youngest age from a statement and marks the years derived", () => {
    expect(derivedAge(null, { ageStatement: "8 to 12 years" }, true)).toEqual({ ageYears: "8", ageMonths: null, ageDays: null, ageYearsSource: "derived" });
    expect(derivedAge({}, { ageStatement: "12 Year" }, true)).toMatchObject({ ageYears: "12", ageYearsSource: "derived" });
  });
  it("never replaces an age that was entered", () => {
    expect(derivedAge({ ageYears: "10", ageYearsSource: "entered" }, { ageStatement: "12 Year" }, true)).toEqual({});
    expect(derivedAge({ ageMonths: 6 }, { ageStatement: "12 Year" }, true)).toEqual({});
  });
  it("does replace years it derived itself, and clears them when the statement says no age", () => {
    expect(derivedAge({ ageYears: "8", ageYearsSource: "derived" }, { ageStatement: "12 Year" }, true)).toMatchObject({ ageYears: "12", ageYearsSource: "derived" });
    expect(derivedAge({ ageYears: "8", ageYearsSource: "derived" }, { ageStatement: "" }, true)).toEqual({ ageYears: null, ageMonths: null, ageDays: null, ageYearsSource: "entered" });
    expect(derivedAge({ ageYears: "8", ageYearsSource: "derived" }, { ageStatement: "NAS" }, true)).toMatchObject({ ageYears: null });
  });
  it("marks the age entered when years, months or days are typed", () => {
    for (const key of ["ageYears", "ageMonths", "ageDays"]) expect(derivedAge({ ageYearsSource: "derived" }, { [key]: "5" }, true)).toEqual({ ageYearsSource: "entered" });
  });
  it("does nothing for a spirit that is not whiskey, or a patch that does not touch the age", () => {
    expect(derivedAge(null, { ageStatement: "8 Year" }, false)).toEqual({});
    expect(derivedAge(null, { ageYears: "5" }, false)).toEqual({});
    expect(derivedAge(null, { proof: "100" }, true)).toEqual({});
  });
  it("counts an age as filled when any of years, months or days has something", () => {
    expect(hasAge({})).toBe(false);
    expect(hasAge({ ageYears: "", ageMonths: null })).toBe(false);
    expect(hasAge({ ageDays: 3 })).toBe(true);
  });
});
