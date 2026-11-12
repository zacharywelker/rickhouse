import { describe, expect, it } from "vitest";
import { applyEdits } from "../changes";
import { EDITORS, editorFor, parseCell } from "../editors";
import { parseAge } from "../age";
import { bottlePatchBody } from "../save";
import { SHEET_COLUMNS, type SheetBottle, type SheetColumn, type SheetContext, type SheetLabel, type SheetRow } from "../sheet";

describe("what a typed age means", () => {
  it("reads a bare number as years and letters as years, months and days", () => {
    expect(parseAge("12")).toEqual({ kind: "parts", years: "12", months: null, days: null });
    expect(parseAge("12.5")).toEqual({ kind: "parts", years: "12.5", months: null, days: null });
    expect(parseAge("12y 6m")).toEqual({ kind: "parts", years: "12", months: "6", days: null });
    expect(parseAge("6M")).toEqual({ kind: "parts", years: null, months: "6", days: null });
    expect(parseAge("4y6m10d")).toEqual({ kind: "parts", years: "4", months: "6", days: "10" });
    expect(parseAge("90 d")).toEqual({ kind: "parts", years: null, months: null, days: "90" });
  });
  it("reads NAS, blank, and anything else as the statement as printed", () => {
    expect(parseAge("nas")).toEqual({ kind: "nas" });
    expect(parseAge("  ")).toEqual({ kind: "none" });
    expect(parseAge("12 Year")).toEqual({ kind: "statement", text: "12 Year" });
    expect(parseAge("8 to 12 years")).toEqual({ kind: "statement", text: "8 to 12 years" });
    expect(parseAge("5 months old")).toEqual({ kind: "statement", text: "5 months old" });
  });
  it("refuses numbers the form would", () => {
    expect(parseAge("101")).toEqual({ error: "At most 100 years." });
    expect(parseAge("12.55")).toMatchObject({ error: expect.stringMatching(/decimal/) });
    expect(parseAge("1.5m")).toMatchObject({ error: expect.stringMatching(/whole/) });
    expect(parseAge("1201m")).toMatchObject({ error: "At most 1200 months." });
    expect(parseAge("40001d")).toMatchObject({ error: "At most 40000 days." });
    expect(parseAge("x".repeat(201))).toMatchObject({ error: expect.stringMatching(/200/) });
  });
});

const label = (over: Record<string, unknown> = {}) => ({ id: 1, brand: "B", name: "L", categoryId: 5, fieldGroup: "whiskey", proof: "100", sizeMl: 750, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, isNas: false, isAgedGin: false, tequilaClass: null, ...over }) as unknown as SheetLabel;
const bottle = (over: Record<string, unknown> = {}) => ({ id: 7, expressionId: 1, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ginIsNas: null, tequilaClass: null, ...over }) as unknown as SheetBottle;
const row = (l = label(), b: SheetBottle | null = bottle()): SheetRow => ({ key: "b7", label: l, bottle: b });
const kinds = { 5: "american" } as const;
const ctx: SheetContext = { currency: "USD", kinds };
const col = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;

describe("the label's Age cell", () => {
  const age = EDITORS.age!;
  it("holds the age as the Age column writes it, or the statement, or NAS", () => {
    expect(age.initial(row(label({ ageYears: "12.0", ageMonths: 6 })))).toBe("12y 6m");
    expect(age.initial(row(label({ ageStatement: "8 to 12 years" })))).toBe("8 to 12 years");
    expect(age.initial(row(label({ isNas: true })))).toBe("NAS");
    expect(age.initial(row())).toBe("");
  });
  it("sets its four fields together, clearing the ones it does not use, so nothing stale sits under it", () => {
    expect(age.fieldsOf!("12y 6m")).toEqual({ ageYears: "12", ageMonths: "6", ageDays: null, ageStatement: null, isNas: false });
    expect(age.fieldsOf!("12 Year")).toEqual({ ageYears: null, ageMonths: null, ageDays: null, ageStatement: "12 Year", isNas: false });
    expect(age.fieldsOf!("NAS")).toEqual({ ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, isNas: true });
    expect(age.fieldsOf!("")).toEqual({ ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, isNas: false });
  });
  it("is editable for a spirit that ages, and not for vodka", () => {
    expect(editorFor(col("age"), { labels: true, bottles: false }, row(label(), null), undefined, kinds)?.column).toBe("age");
    expect(editorFor(col("age"), { labels: true, bottles: false }, row(label({ fieldGroup: "vodka" }), null), undefined, { 5: "vodka" })).toBeNull();
  });
  it("says why a value is refused for the spirit, by the form's own rules", () => {
    const tequila = row(label({ fieldGroup: "agave", tequilaClass: "reposado" }), null);
    expect(parseCell(age, "12 Year", "2026-01-01", tequila, { 5: "tequila" })).toMatchObject({ ok: false, message: expect.stringMatching(/no age statement/) });
    expect(parseCell(age, "NAS", "2026-01-01", tequila, { 5: "tequila" })).toMatchObject({ ok: false, message: expect.stringMatching(/NAS/) });
    expect(parseCell(age, "2y", "2026-01-01", tequila, { 5: "tequila" })).toEqual({ ok: true, value: "2y" });
    const blanco = row(label({ fieldGroup: "agave", tequilaClass: "blanco" }), null);
    // A blanco has no age and tequila no statement: nothing of the cell is used.
    expect(editorFor(col("age"), { labels: true, bottles: false }, blanco, undefined, { 5: "tequila" })).toBeNull();
    const gin = row(label({ fieldGroup: "gin", isAgedGin: true }), null);
    expect(parseCell(age, "12 Year", "2026-01-01", gin, { 5: "gin" })).toMatchObject({ ok: false });
    expect(parseCell(age, "6y", "2026-01-01", row(label({ fieldGroup: "amaro", isAged: true }), null), { 5: "amaro" })).toEqual({ ok: true, value: "6y" });
    expect(parseCell(age, "10d", "2026-01-01", row(label({ fieldGroup: "amaro", isAged: true }), null), { 5: "amaro" })).toMatchObject({ ok: false });
  });
  it("shows what was typed the way the Age column does, and lets the row's other cells see it", () => {
    expect(age.display("12y 6m", ctx, row()).text).toBe("12y 6m");
    expect(age.display("NAS", ctx, row()).text).toBe("NAS");
    expect(age.display("", ctx, row()).text).toBe("—");
    expect(applyEdits([row()], { l1: { age: "10" } })[0]!.label).toMatchObject({ ageYears: "10", ageStatement: null });
  });
});

describe("a bottle's own Age cell", () => {
  const own = EDITORS.ownAge!;
  it("is blank when the bottle says nothing, and then shows the label's in grey", () => {
    expect(own.initial(row())).toBe("");
    const shown = own.display("", ctx, row(label({ ageYears: "12.0" })));
    expect(shown).toMatchObject({ text: "12y", muted: true });
    expect(own.display("8y", ctx, row())).toEqual({ text: "8y" });
  });
  it("sets the bottle's four age fields, and NAS only for an aged gin", () => {
    expect(own.fieldsOf!("8y 2m")).toEqual({ ageYears: "8", ageMonths: "2", ageDays: null, ageStatement: null });
    expect(own.fieldsOf!("")).toEqual({ ageYears: null, ageMonths: null, ageDays: null, ageStatement: null });
    expect(bottlePatchBody({ ownAge: "12 Year" }, undefined)).toMatchObject({ ageStatement: "12 Year", ageYears: null });
    const gin = row(label({ fieldGroup: "gin", isAgedGin: true }));
    expect(parseCell(own, "NAS", "2026-01-01", gin, { 5: "gin" })).toEqual({ ok: true, value: "NAS" });
    expect(parseCell(own, "NAS", "2026-01-01", row(), kinds)).toMatchObject({ ok: false });
    expect(own.fieldsOf!("NAS")).toMatchObject({ ginIsNas: "true" });
  });
  it("is refused for a blanco and for a gin that is not aged", () => {
    expect(editorFor(col("ownAge"), { labels: false, bottles: true }, row(label({ fieldGroup: "agave", tequilaClass: "blanco" })), undefined, { 5: "tequila" })).toBeNull();
    // A reposado bottle of a blanco label: the bottle's own class decides, and it takes years but not a statement.
    const reposado = row(label({ fieldGroup: "agave", tequilaClass: "blanco" }), bottle({ tequilaClass: "reposado" }));
    expect(parseCell(own, "2y", "2026-01-01", reposado, { 5: "tequila" })).toEqual({ ok: true, value: "2y" });
    expect(parseCell(own, "2 Year", "2026-01-01", reposado, { 5: "tequila" })).toMatchObject({ ok: false });
    expect(editorFor(col("ownAge"), { labels: false, bottles: true }, row(label({ fieldGroup: "gin", isAgedGin: false })), undefined, { 5: "gin" })).toBeNull();
  });
});

describe("the Age column for a whiskey marked NAS", () => {
  it("says NAS when there is nothing to infer from, and keeps the inferred minimum when there is", () => {
    const col = SHEET_COLUMNS.find((c) => c.id === "age")!;
    expect(col.cell(row(label({ isNas: true }), null), ctx).text).toBe("NAS");
    expect(col.cell(row(label({ isNas: true, isStraight: true }), null), ctx).text).toBe("4 yrs");
    expect(col.cell(row(label(), null), ctx).text).toBe("—");
  });
});
