import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ColaSearchError, isSpiritsClass, parseColaSearch } from "../parse";

function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures", name), "latin1");
}

describe("parseColaSearch", () => {
  it("reads a page of results, its total and the next-page link", () => {
    const page = parseColaSearch(fixture("search-old-potrero.html"));
    expect(page.total).toBe(28);
    expect(page.rows).toHaveLength(20);
    expect(page.nextHref).toBe("publicPageBasicCola.do?action=page&pgfcn=nextset");
    expect(page.rows.find((row) => row.ttbId === "21132001000620")).toEqual({
      ttbId: "21132001000620",
      permitNumber: "DSP-CA-267",
      serialNumber: "210027",
      completedOn: "2021-05-14",
      fancifulName: "6 YO",
      brandName: "OLD POTRERO",
      originCode: "01",
      origin: "CALIFORNIA",
      classTypeCode: "102",
      classType: "STRAIGHT RYE WHISKY",
    });
  });

  it("keeps a missing fanciful name empty rather than shifting the columns", () => {
    const row = parseColaSearch(fixture("search-old-potrero.html")).rows.find((r) => r.ttbId === "21106001000944");
    expect(row).toMatchObject({ fancifulName: null, brandName: "OLD POTRERO", classTypeCode: "109" });
  });

  it("returns nothing for a search with no matches", () => {
    expect(parseColaSearch(fixture("search-no-results.html"))).toEqual({ rows: [], total: 0, nextHref: null });
  });

  it("surfaces the registry's own complaint about the search", () => {
    expect(() => parseColaSearch(fixture("search-error.html"))).toThrow(ColaSearchError);
    expect(() => parseColaSearch(fixture("search-error.html"))).toThrow(/15 year/);
  });
});

describe("isSpiritsClass", () => {
  it("keeps whiskey, gin, rum, brandy, cordials, cocktails and agave", () => {
    for (const code of ["101", "102", "641", "200", "401", "501", "601", "701", "943", "977", "979", "920"]) {
      expect(isSpiritsClass(code)).toBe(true);
    }
  });

  it("drops wine, beer, sake, mixes and withdrawals", () => {
    for (const code of ["80", "80A", "88", "900", "904", "950", "931", "981", "940", "990", "0", "000"]) {
      expect(isSpiritsClass(code)).toBe(false);
    }
  });
});
