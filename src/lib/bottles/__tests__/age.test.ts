import { describe, expect, it } from "vitest";
import { ageBetween, describeAge } from "../age";

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
