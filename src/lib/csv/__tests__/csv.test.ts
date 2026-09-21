import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRows, toCsv, toCsvCell } from "../index";

describe("parseCsv", () => {
  it("reads plain rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a comma inside quotes in one field", () => {
    // The bug that silently corrupts an import.
    expect(parseCsv('brand,distilleries\nPursuit,"Bardstown, Tennessee, Finger Lakes"')).toEqual([
      ["brand", "distilleries"],
      ["Pursuit", "Bardstown, Tennessee, Finger Lakes"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('note\n"He said ""neat"" and meant it"')).toEqual([
      ["note"],
      ['He said "neat" and meant it'],
    ]);
  });

  it("keeps a newline inside quotes in one field", () => {
    expect(parseCsv('a,b\n1,"line one\nline two"')).toEqual([
      ["a", "b"],
      ["1", "line one\nline two"],
    ]);
  });

  it("handles CRLF endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not invent a row for a trailing newline", () => {
    expect(parseCsv("a\n1\n")).toHaveLength(2);
  });

  it("keeps empty fields rather than dropping them", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("strips a UTF-8 BOM off the first header", () => {
    const [header] = parseCsv("﻿brand,name\nx,y");
    expect(header?.[0]).toBe("brand");
  });
});

describe("parseCsvRows", () => {
  it("keys cells by lowercased header", () => {
    const { headers, rows } = parseCsvRows("Brand, Expression \nPursuit,Double Oak");
    expect(headers).toEqual(["brand", "expression"]);
    expect(rows).toEqual([{ brand: "Pursuit", expression: "Double Oak" }]);
  });

  it("gives missing trailing cells an empty string, not undefined", () => {
    const { rows } = parseCsvRows("a,b,c\n1,2");
    expect(rows[0]).toEqual({ a: "1", b: "2", c: "" });
  });

  it("skips blank lines", () => {
    const { rows } = parseCsvRows("a\n1\n\n2\n");
    expect(rows).toEqual([{ a: "1" }, { a: "2" }]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsvRows("")).toEqual({ headers: [], rows: [] });
  });
});

describe("toCsv", () => {
  it("quotes only what needs it", () => {
    expect(toCsvCell("plain")).toBe("plain");
    expect(toCsvCell("has,comma")).toBe('"has,comma"');
    expect(toCsvCell('has"quote')).toBe('"has""quote"');
    expect(toCsvCell("has\nnewline")).toBe('"has\nnewline"');
    expect(toCsvCell(null)).toBe("");
  });

  it("round-trips through the parser", () => {
    const headers = ["brand", "distilleries", "note"];
    const rows = [["Pursuit", "Bardstown, Tennessee", 'He said "neat"']];
    const parsed = parseCsvRows(toCsv(headers, rows));
    expect(parsed.rows[0]).toEqual({
      brand: "Pursuit",
      distilleries: "Bardstown, Tennessee",
      note: 'He said "neat"',
    });
  });
});
