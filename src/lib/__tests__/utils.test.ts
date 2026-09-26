import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumeric, humanise, slugify, timeSince } from "../utils";

describe("formatMoney", () => {
  it("formats Postgres numeric strings without touching floats", () => {
    expect(formatMoney("69.99")).toBe("$69.99");
    expect(formatMoney("1234.50")).toBe("$1,234.50");
    expect(formatMoney("1234567.05")).toBe("$1,234,567.05");
  });

  it("pads a missing or short fraction", () => {
    expect(formatMoney("70")).toBe("$70.00");
    expect(formatMoney("70.5")).toBe("$70.50");
  });

  it("keeps cents that a float would lose", () => {
    // 0.1 + 0.2 territory: the string path must round-trip exactly.
    expect(formatMoney("8899.29")).toBe("$8,899.29");
    expect(formatMoney("1999.99")).toBe("$1,999.99");
  });

  it("handles negatives and blanks", () => {
    expect(formatMoney("-12.00")).toBe("-$12.00");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney("")).toBe("—");
  });
});

describe("formatNumeric", () => {
  it("trims Postgres numeric padding", () => {
    expect(formatNumeric("108.00")).toBe("108");
    expect(formatNumeric("54.50")).toBe("54.5");
    expect(formatNumeric("100.00")).toBe("100");
    expect(formatNumeric("7.5")).toBe("7.5");
    expect(formatNumeric("120")).toBe("120");
  });

  it("returns a dash for nothing", () => {
    expect(formatNumeric(null)).toBe("—");
  });
});

describe("slugify", () => {
  it("makes URL-safe slugs from bottle names", () => {
    expect(slugify("Double Oak Spirit")).toBe("double-oak-spirit");
    expect(slugify("P.Club by Pursuit Spirits")).toBe("p-club-by-pursuit-spirits");
    expect(slugify("Tennessee Distilling Ltd.")).toBe("tennessee-distilling-ltd");
    expect(slugify("  E.H. Taylor, Jr.  ")).toBe("e-h-taylor-jr");
  });
});

describe("humanise", () => {
  it("capitalises the stored enum text", () => {
    expect(humanise("purchase")).toBe("Purchase");
    expect(humanise("owned")).toBe("Owned");
    expect(humanise("cane juice")).toBe("Cane juice");
  });

  it("returns a dash for nothing", () => {
    expect(humanise(null)).toBe("—");
    expect(humanise("")).toBe("—");
  });
});

describe("formatDate", () => {
  it("reads a Postgres date the way a person writes it", () => {
    expect(formatDate("2024-04-20")).toBe("Apr 20, 2024");
    expect(formatDate("2019-12-01")).toBe("Dec 1, 2019");
  });

  it("never shifts the day for the timezone", () => {
    expect(formatDate("2024-01-01")).toBe("Jan 1, 2024");
  });

  it("returns a dash for nothing, and leaves junk alone", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("timeSince", () => {
  const today = new Date(2026, 8, 25); // Sep 25, 2026, local time

  it("uses one unit, rounded down", () => {
    expect(timeSince("2026-09-25", today)).toBe("today");
    expect(timeSince("2026-09-24", today)).toBe("yesterday");
    expect(timeSince("2026-09-20", today)).toBe("5 days ago");
    expect(timeSince("2026-09-01", today)).toBe("3 weeks ago");
    expect(timeSince("2026-08-25", today)).toBe("a month ago");
    expect(timeSince("2026-03-26", today)).toBe("5 months ago");
    expect(timeSince("2025-09-25", today)).toBe("a year ago");
    expect(timeSince("2024-10-01", today)).toBe("a year ago");
    expect(timeSince("2019-04-04", today)).toBe("7 years ago");
  });

  it("says nothing about the future or nothing at all", () => {
    expect(timeSince("2027-01-01", today)).toBeNull();
    expect(timeSince(null, today)).toBeNull();
  });
});
