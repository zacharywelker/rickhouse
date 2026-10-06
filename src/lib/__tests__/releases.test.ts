import { describe, expect, it } from "vitest";
import { parseReleaseRow, parseReleaseRows, releaseLabel, releaseRow, type ReleaseRow } from "../releases";

const blank: ReleaseRow = {
  id: "",
  name: "",
  year: "",
  proof: "",
  ageYears: "",
  ageMonths: "",
  ageDays: "",
  ageStatement: "",
  msrp: "",
};

describe("parseReleaseRows", () => {
  it("reads every part, and rows with only some of them", () => {
    const { releases, error } = parseReleaseRows(
      JSON.stringify([
        { ...blank, id: "4", name: "2024-01 Springfield", year: "2024", proof: "124.6", ageYears: "7", ageMonths: "2", ageDays: "3", msrp: "$99.99" },
        { ...blank, name: "Batch C923" },
      ]),
    );
    expect(error).toBeNull();
    expect(releases).toEqual([
      {
        id: 4,
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
        id: null,
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

  it("skips rows left without a name", () => {
    expect(parseReleaseRows(JSON.stringify([{ ...blank, proof: "100" }])).releases).toEqual([]);
  });

  it("refuses two releases with one name, ignoring case", () => {
    const rows = [{ ...blank, name: "Batch A" }, { ...blank, name: "batch a" }];
    expect(parseReleaseRows(JSON.stringify(rows)).error).toMatch(/both called/);
  });

  it("refuses bad values rather than guessing", () => {
    const one = (row: Partial<ReleaseRow>) => parseReleaseRow({ ...blank, name: "A", ...row }).error;
    expect(one({ year: "24" })).toMatch(/not a year/);
    expect(one({ proof: "250" })).toMatch(/not a proof/);
    expect(one({ ageYears: "300" })).toMatch(/years/);
    expect(one({ ageMonths: "1.5" })).toMatch(/months/);
    expect(one({ msrp: "cheap" })).toMatch(/price/);
    expect(parseReleaseRows("not json").error).toMatch(/could not be read/);
  });

  it("round-trips a stored release, keeping a wording-only age", () => {
    const stored = {
      id: 9,
      name: "Old Stock",
      releaseYear: 2020,
      proof: "124.60",
      ageYears: "7.0",
      ageMonths: null,
      ageDays: null,
      ageStatement: "at least 6 years",
      msrp: "99.99",
    };
    const row = releaseRow(stored);
    expect(row).toMatchObject({ id: "9", proof: "124.6", ageYears: "7" });
    expect(parseReleaseRow(row).value).toMatchObject({ id: 9, ageStatement: "at least 6 years", ageYears: "7" });
  });
});

describe("releaseLabel", () => {
  it("adds the year only when the name does not already say it", () => {
    expect(releaseLabel({ name: "Bourbon War", releaseYear: 2020 })).toBe("Bourbon War (2020)");
    expect(releaseLabel({ name: "2024-01 Springfield", releaseYear: 2024 })).toBe("2024-01 Springfield");
    expect(releaseLabel({ name: "Batch C923", releaseYear: null })).toBe("Batch C923");
  });
});
