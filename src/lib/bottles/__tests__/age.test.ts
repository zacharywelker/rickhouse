import { describe, expect, it } from "vitest";
import { ageBetween, defaultAgeStatement, describeAge, offeredAgeStatement, withImpliedAge } from "../age";

describe("ageBetween", () => {
  it("counts whole years by the calendar, not by dividing days", () => {
    expect(ageBetween("2012-03-14", "2024-03-14")).toEqual({ years: 12, months: 0, days: 0 });
  });

  it("carries months and days", () => {
    expect(ageBetween("2012-03-14", "2024-09-02")).toEqual({ years: 12, months: 5, days: 19 });
  });

  it("borrows from the month before the bottling date, so February is right", () => {
    // 31 January to 1 March in a leap year: one month and one day, because
    // February had 29. A naive 30-day borrow would say two days.
    expect(ageBetween("2020-01-31", "2020-03-01")).toEqual({ years: 0, months: 1, days: 1 });
  });

  it("handles a leap day fill without drifting under a year", () => {
    expect(ageBetween("2020-02-29", "2024-02-29")).toEqual({ years: 4, months: 0, days: 0 });
  });

  it("refuses a bottling date before the fill", () => {
    expect(ageBetween("2024-01-01", "2020-01-01")).toBeNull();
  });

  it("refuses anything that is not a date", () => {
    expect(ageBetween("", "2020-01-01")).toBeNull();
    expect(ageBetween("2020-13-01", "2021-01-01")).toBeNull();
    expect(ageBetween("not a date", "2021-01-01")).toBeNull();
  });
});

describe("describeAge", () => {
  it("reads the way a label reads", () => {
    expect(describeAge({ years: 12, months: 0, days: 0 })).toBe("12 Year");
    expect(describeAge({ years: 12, months: 5, days: 19 })).toBe("12 Year 5 Month");
    expect(describeAge({ years: 0, months: 3, days: 2 })).toBe("3 Month");
  });

  it("falls back to days when there is nothing bigger to say", () => {
    expect(describeAge({ years: 0, months: 0, days: 6 })).toBe("6 Day");
  });
});

describe("defaultAgeStatement", () => {
  it("is blank when nothing is checked", () => {
    expect(defaultAgeStatement({ isBottledInBond: false, isNas: false })).toBe("");
  });

  it("names the designation that was checked", () => {
    expect(defaultAgeStatement({ isBottledInBond: true, isNas: false })).toBe("Bottled-in-Bond (at least 4 years)");
    expect(defaultAgeStatement({ isBottledInBond: false, isNas: true })).toBe("NAS");
  });
});

describe("offeredAgeStatement", () => {
  it("offers the designation's statement when one is switched on and the statement is blank", () => {
    const prev = { isBottledInBond: false, ageStatement: "" };
    expect(offeredAgeStatement(prev, { ...prev, isBottledInBond: true }, "isBottledInBond")).toBe(
      "Bottled-in-Bond (at least 4 years)",
    );
  });

  it("never overwrites a statement someone typed", () => {
    const prev = { isBottledInBond: false, ageStatement: "7 Year" };
    expect(offeredAgeStatement(prev, { ...prev, isBottledInBond: true }, "isBottledInBond")).toBeNull();
  });

  it("takes its own default back out when the designation is unticked", () => {
    const prev = { isBottledInBond: true, ageStatement: "Bottled-in-Bond (at least 4 years)" };
    expect(offeredAgeStatement(prev, { ...prev, isBottledInBond: false }, "isBottledInBond")).toBe("");
  });

  it("leaves typed text alone when a designation is unticked", () => {
    const prev = { isBottledInBond: true, ageStatement: "7 Year" };
    expect(offeredAgeStatement(prev, { ...prev, isBottledInBond: false }, "isBottledInBond")).toBeNull();
  });

  it("offers nothing once an age is filled in", () => {
    const prev = { isNas: false, ageStatement: "", ageYears: "6" };
    expect(offeredAgeStatement(prev, { ...prev, isNas: true }, "isNas")).toBeNull();
  });

  it("offers nothing when switching one off, or for other fields", () => {
    const prev = { isNas: true, ageStatement: "" };
    expect(offeredAgeStatement(prev, { ...prev, isNas: false }, "isNas")).toBeNull();
    expect(offeredAgeStatement(prev, { ...prev, proof: "100" }, "proof")).toBeNull();
  });
});

describe("withImpliedAge", () => {
  const blankAge = { isStraight: false, isNas: false, ageYears: "", ageMonths: "", ageDays: "", proof: "" };

  it("fills 2 years for Straight and 4 for Straight with NAS", () => {
    const straight = withImpliedAge(blankAge, { ...blankAge, isStraight: true }, "isStraight");
    expect(straight.ageYears).toBe("2");
    const nas = withImpliedAge(straight, { ...straight, isNas: true }, "isNas");
    expect(nas.ageYears).toBe("4");
  });

  it("takes its own number back out when unticked", () => {
    const both = { ...blankAge, isStraight: true, isNas: true, ageYears: "4" };
    expect(withImpliedAge(both, { ...both, isNas: false }, "isNas").ageYears).toBe("2");
    const straight = { ...blankAge, isStraight: true, ageYears: "2" };
    expect(withImpliedAge(straight, { ...straight, isStraight: false }, "isStraight").ageYears).toBe("");
  });

  it("changes nothing when any age was typed", () => {
    const typed = { ...blankAge, ageYears: "7" };
    expect(withImpliedAge(typed, { ...typed, isStraight: true }, "isStraight").ageYears).toBe("7");
    const months = { ...blankAge, ageMonths: "30" };
    expect(withImpliedAge(months, { ...months, isStraight: true }, "isStraight").ageYears).toBe("");
  });

  it("ignores other fields", () => {
    expect(withImpliedAge(blankAge, { ...blankAge, proof: "90" }, "proof").ageYears).toBe("");
  });
});
