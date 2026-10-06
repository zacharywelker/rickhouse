import { describe, expect, it } from "vitest";
import { parseReleases, releaseLabel, releasesText } from "../releases";

describe("parseReleases", () => {
  it("reads every column, and lines with only some of them", () => {
    const { releases, error } = parseReleases(
      "2024-01 Springfield | 2024 | 124.6 | 7y 2m 3d | $99.99\nBourbon War | 2020 | | 4\nBatch C923",
    );
    expect(error).toBeNull();
    expect(releases).toEqual([
      {
        name: "2024-01 Springfield",
        releaseYear: 2024,
        proof: "124.6",
        ageYears: "7",
        ageMonths: 2,
        ageDays: 3,
        ageStatement: null,
        msrp: "99.99",
      },
      {
        name: "Bourbon War",
        releaseYear: 2020,
        proof: null,
        ageYears: "4",
        ageMonths: null,
        ageDays: null,
        ageStatement: null,
        msrp: null,
      },
      {
        name: "Batch C923",
        releaseYear: null,
        proof: null,
        ageYears: null,
        ageMonths: null,
        ageDays: null,
        ageStatement: null,
        msrp: null,
      },
    ]);
  });

  it("keeps an age it cannot split as the statement", () => {
    const { releases } = parseReleases("Old Stock | | | at least 6 years");
    expect(releases[0]!.ageStatement).toBe("at least 6 years");
    expect(releases[0]!.ageYears).toBeNull();
  });

  it("drops blanks and case-insensitive repeats", () => {
    const { releases } = parseReleases("\nBatch A\n\nbatch a | 2020\r\n");
    expect(releases).toHaveLength(1);
  });

  it("refuses bad lines rather than guessing", () => {
    expect(parseReleases("| 2024").error).toMatch(/no name/);
    expect(parseReleases("A | 24").error).toMatch(/not a year/);
    expect(parseReleases("A | | 250").error).toMatch(/not a proof/);
    expect(parseReleases("A | | | 300").error).toMatch(/believable/);
    expect(parseReleases("A | | | | cheap").error).toMatch(/not a price/);
    expect(parseReleases("A|1|2|3|4|5").error).toMatch(/more than five/);
  });

  it("round-trips through releasesText, including database-shaped numbers", () => {
    const text = "2024-01 Springfield | 2024 | 124.6 | 7y 2m 3d | 99.99\nBourbon War | 2020 | | 4y\nBatch C923";
    expect(releasesText(parseReleases(text).releases)).toBe(text);
    const fromDb = { ...parseReleases(text).releases[0]!, proof: "124.60", ageYears: "7.0", msrp: "99.99" };
    expect(releasesText([fromDb])).toBe("2024-01 Springfield | 2024 | 124.6 | 7y 2m 3d | 99.99");
  });
});

describe("releaseLabel", () => {
  it("adds the year only when the name does not already say it", () => {
    expect(releaseLabel({ name: "Bourbon War", releaseYear: 2020 })).toBe("Bourbon War (2020)");
    expect(releaseLabel({ name: "2024-01 Springfield", releaseYear: 2024 })).toBe("2024-01 Springfield");
    expect(releaseLabel({ name: "Batch C923", releaseYear: null })).toBe("Batch C923");
  });
});
