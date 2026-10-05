import { describe, expect, it } from "vitest";
import { nameWithYears, otherNamesText, parseOtherNames, yearsText } from "../other-names";

describe("parseOtherNames", () => {
  it("reads names with and without years", () => {
    const { names, error } = parseOtherNames(
      "Old Grand-Dad Bonded (1980–1995)\nOld Grand-Dad 100 (from 1996)\nHirsch (until 1985)\nPlain Name\nOne Year (1990)",
    );
    expect(error).toBeNull();
    expect(names).toEqual([
      { name: "Old Grand-Dad Bonded", yearFrom: 1980, yearTo: 1995 },
      { name: "Old Grand-Dad 100", yearFrom: 1996, yearTo: null },
      { name: "Hirsch", yearFrom: null, yearTo: 1985 },
      { name: "Plain Name", yearFrom: null, yearTo: null },
      { name: "One Year", yearFrom: 1990, yearTo: 1990 },
    ]);
  });

  it("accepts a hyphen and leaves other brackets in the name", () => {
    const { names } = parseOtherNames("Rye (Old Style) (1950-1960)\nBlend (Old Style)");
    expect(names[0]).toEqual({ name: "Rye (Old Style)", yearFrom: 1950, yearTo: 1960 });
    expect(names[1]).toEqual({ name: "Blend (Old Style)", yearFrom: null, yearTo: null });
  });

  it("drops blanks and case-insensitive repeats", () => {
    const { names } = parseOtherNames("\nHirsch\n\nhirsch (1990)\r\n");
    expect(names).toHaveLength(1);
    expect(names[0]!.name).toBe("Hirsch");
  });

  it("rejects backwards years and a missing name", () => {
    expect(parseOtherNames("X (1995–1980)").error).toMatch(/ends before it starts/);
    expect(parseOtherNames("(1980–1990)").error).toMatch(/no name/);
  });

  it("treats nothing as no names", () => {
    expect(parseOtherNames(null)).toEqual({ names: [], error: null });
  });
});

describe("formatting", () => {
  it("writes years back the way they are read", () => {
    const names = [
      { name: "A", yearFrom: 1980, yearTo: 1995 },
      { name: "B", yearFrom: 1996, yearTo: null },
      { name: "C", yearFrom: null, yearTo: 1985 },
      { name: "D", yearFrom: null, yearTo: null },
    ];
    expect(otherNamesText(names)).toBe("A (1980–1995)\nB (from 1996)\nC (until 1985)\nD");
    expect(parseOtherNames(otherNamesText(names)).names).toEqual(names);
    expect(yearsText({ yearFrom: 1990, yearTo: 1990 })).toBe("1990");
    expect(nameWithYears(names[3]!)).toBe("D");
  });
});
