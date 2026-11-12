import { describe, expect, it } from "vitest";
import { copyText, matchName, parseTsv, readDate, readPasted, toTsv } from "../clipboard";
import { EDITORS } from "../editors";

describe("tab-separated text", () => {
  it("reads rows and fields, and does not make an empty last row of a trailing line break", () => {
    expect(parseTsv("a\tb\nc\td\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseTsv("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseTsv("one")).toEqual([["one"]]);
    expect(parseTsv("")).toEqual([]);
  });
  it("keeps empty fields", () => {
    expect(parseTsv("a\t\tc")).toEqual([["a", "", "c"]]);
    expect(parseTsv("\tb")).toEqual([["", "b"]]);
  });
  it("reads a quoted field with a tab, a line break or a quote in it", () => {
    expect(parseTsv('"a\tb"\t"line1\nline2"\t"say ""hi"""')).toEqual([["a\tb", "line1\nline2", 'say "hi"']]);
  });
  it("writes what it reads back, quoting only where it must", () => {
    const rows = [["plain", "has\ttab", 'has "quote"'], ["has\nbreak", "", "x"]];
    expect(toTsv(rows)).toBe('plain\t"has\ttab"\t"has ""quote"""\n"has\nbreak"\t\tx');
    expect(parseTsv(toTsv(rows))).toEqual(rows);
  });
});

describe("dates", () => {
  it("reads ISO, month/day/year and written-out dates, and nothing that rolls over", () => {
    expect(readDate("2025-06-14")).toBe("2025-06-14");
    expect(readDate("6/4/2025")).toBe("2025-06-04");
    expect(readDate("Jun 14, 2025")).toBe("2025-06-14");
    expect(readDate("June 14 2025")).toBe("2025-06-14");
    expect(readDate("2025-02-31")).toBeNull();
    expect(readDate("13/1/2025")).toBeNull();
    expect(readDate("soon")).toBeNull();
  });
});

describe("what a pasted piece of text means for a cell", () => {
  const read = (id: string, text: string) => readPasted(EDITORS[id]!, text);
  it("reads a price or a size as a spreadsheet shows it", () => {
    expect(read("pricePaid", "$1,047.50")).toEqual({ ok: true, value: "1047.50" });
    expect(read("sizeMl", "750 mL")).toEqual({ ok: true, value: "750" });
    expect(read("proof", " 101 ")).toEqual({ ok: true, value: "101" });
  });
  it("reads a date in the forms above, and says so when it is not one", () => {
    expect(read("dateAcquired", "11/1/2025")).toEqual({ ok: true, value: "2025-11-01" });
    expect(read("dateAcquired", "Nov 1, 2025")).toEqual({ ok: true, value: "2025-11-01" });
    expect(read("dateAcquired", "—")).toEqual({ ok: true, value: "" });
    expect(read("dateAcquired", "last week")).toEqual({ ok: false, message: expect.stringMatching(/date/) });
  });
  it("reads a choice by its label or its value, in any case", () => {
    expect(read("singleBarrel", "private pick")).toEqual({ ok: true, value: "pick" });
    expect(read("singleBarrel", "Single barrel · Private pick")).toEqual({ ok: true, value: "both" });
    expect(read("status", "SOLD")).toEqual({ ok: true, value: "sold" });
    expect(read("fillPct", "½")).toEqual({ ok: true, value: "50" });
    expect(read("fillPct", "75")).toEqual({ ok: true, value: "75" });
    expect(read("status", "lost")).toMatchObject({ ok: false });
  });
  it("reads yes and no in the ways a spreadsheet writes them", () => {
    for (const yes of ["Yes", "TRUE", "1", "x", "y"]) expect(read("isFavorite", yes)).toEqual({ ok: true, value: "true" });
    for (const no of ["No", "false", "0", "", "—"]) expect(read("isFavorite", no)).toEqual({ ok: true, value: "false" });
    expect(read("isFavorite", "maybe")).toMatchObject({ ok: false });
  });
});

describe("what a cell copies", () => {
  const shown = (text: string) => ({ text });
  it("copies the value as it is typed, and a choice by its label", () => {
    expect(copyText(EDITORS.dateAcquired!, "2025-11-01", shown("Nov 1, 2025"))).toBe("2025-11-01");
    expect(copyText(EDITORS.pricePaid!, "47.00", shown("$47.00"))).toBe("47.00");
    expect(copyText(EDITORS.singleBarrel!, "pick", shown("Private pick"))).toBe("Private pick");
    expect(copyText(EDITORS.status!, "open", shown("Open"))).toBe("Open");
    expect(copyText(EDITORS.isFavorite!, "true", shown("Yes"))).toBe("Yes");
    expect(copyText(EDITORS.isFavorite!, "false", shown("—"))).toBe("No");
  });
  it("copies what a name picked from a list shows, and nothing for a blank", () => {
    expect(copyText(EDITORS.store!, "id:3", shown("Astor Wines"))).toBe("Astor Wines");
    expect(copyText(EDITORS.store!, "", shown("—"))).toBe("");
    expect(copyText(null, "", shown("12"))).toBe("12");
  });
  it("round trips: what is copied pastes back as the same value", () => {
    for (const [id, value] of [["dateAcquired", "2025-11-01"], ["pricePaid", "47.00"], ["singleBarrel", "both"], ["status", "traded"], ["fillPct", "25"], ["isFavorite", "true"]] as const) {
      const editor = EDITORS[id]!;
      expect(readPasted(editor, copyText(editor, value, shown("x")))).toEqual({ ok: true, value });
    }
  });
});

describe("a pasted name against a list", () => {
  const stores = [{ id: 1, name: "Astor Wines" }, { id: 2, name: "Astor Place Liquor" }, { id: 3, name: "Binny's" }, { id: 4, name: "Binny's" }];
  it("takes a complete name, in any case, that one thing has", () => {
    expect(matchName("astor wines", stores)).toEqual({ kind: "exact", match: stores[0] });
    expect(matchName("  Astor Wines ", stores)).toEqual({ kind: "exact", match: stores[0] });
  });
  it("only searches for a part of a name or a near miss", () => {
    expect(matchName("Astor", stores)).toEqual({ kind: "search" });
    expect(matchName("Astor Wine", stores)).toEqual({ kind: "search" });
    expect(matchName("Nowhere", stores)).toEqual({ kind: "search" });
  });
  it("leaves the choice to the person when two things have the name", () => {
    expect(matchName("Binny's", stores)).toEqual({ kind: "search" });
  });
  it("sees a blank", () => {
    expect(matchName("", stores)).toEqual({ kind: "blank" });
    expect(matchName("—", stores)).toEqual({ kind: "blank" });
  });
});
