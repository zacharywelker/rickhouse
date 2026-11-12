import { describe, expect, it } from "vitest";
import { applyEdits } from "../changes";
import { EDITORS, editorFor, isLocked, lockKeyOf, parseCell } from "../editors";
import { DEFAULT_HIDDEN, columnsFor, SHEET_COLUMNS, type SheetBottle, type SheetColumn, type SheetContext, type SheetLabel, type SheetRow } from "../sheet";

const label = (over: Record<string, unknown> = {}) => ({ id: 1, brand: "B", name: "L", categoryId: 5, fieldGroup: "whiskey", proof: "100", sizeMl: 750, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", isNas: false, isStraight: false, isBottledInBond: false, isAgedGin: false, tequilaClass: null, ...over }) as unknown as SheetLabel;
const bottle = (over: Record<string, unknown> = {}) => ({ id: 7, expressionId: 1, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", ginIsNas: null, tequilaClass: null, ...over }) as unknown as SheetBottle;
const row = (l = label(), b: SheetBottle | null = bottle()): SheetRow => ({ key: b ? `b${b.id}` : `l${l.id}`, label: l, bottle: b });
const labelsOnly = { labels: true, bottles: false };
const both = { labels: true, bottles: true };
const kinds = { 5: "american" } as const;
const ctx: SheetContext = { currency: "USD", kinds };
const col = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;
const cell = (id: string, r: SheetRow) => col(id).cell(r, ctx);

describe("the age columns", () => {
  it("are Y, M and D under one Age caption that cannot be hidden, with the statement as the next column", () => {
    const ids = columnsFor(labelsOnly, DEFAULT_HIDDEN).map((c) => c.id);
    const at = ids.indexOf("ageYears");
    expect(ids.slice(at, at + 4)).toEqual(["ageYears", "ageMonths", "ageDays", "ageStatement"]);
    for (const id of ["ageYears", "ageMonths", "ageDays"]) expect(col(id)).toMatchObject({ band: "Age", always: true });
    expect(col("ageStatement").band).toBeUndefined();
    expect(columnsFor(labelsOnly, new Set(["ageYears", "ageMonths", "ageDays"])).map((c) => c.id)).toEqual(expect.arrayContaining(["ageYears", "ageMonths", "ageDays"]));
  });
  it("show a bottle's own age as one block: hidden until switched on, and Y, M and D go together", () => {
    expect(columnsFor(both, DEFAULT_HIDDEN).map((c) => c.id)).not.toContain("ownAgeYears");
    const shown = columnsFor(both, new Set([...DEFAULT_HIDDEN].filter((id) => id !== "ownAgeYears"))).map((c) => c.id);
    expect(shown).toEqual(expect.arrayContaining(["ownAgeYears", "ownAgeMonths", "ownAgeDays"]));
    expect(col("ownAgeMonths").with).toBe("ownAgeYears");
  });
});

describe("what a label's cells show", () => {
  it("shows what is stored in each box and the statement beside them", () => {
    const l = label({ ageYears: "12.0", ageMonths: 6, ageStatement: "Old Rare" });
    expect(cell("ageYears", row(l, null)).text).toBe("12");
    expect(cell("ageMonths", row(l, null)).text).toBe("6");
    expect(cell("ageDays", row(l, null)).text).toBe("—");
    expect(cell("ageStatement", row(l, null)).text).toBe("Old Rare");
  });
  it("shows the age a designation implies in grey and italics, and stores nothing", () => {
    const straight = cell("ageYears", row(label({ isStraight: true, isNas: false }), null));
    expect(straight).toMatchObject({ text: "2", muted: true, inferred: true });
    expect(straight.note).toMatch(/Straight/);
    expect(cell("ageYears", row(label({ isBottledInBond: true }), null))).toMatchObject({ text: "4", inferred: true });
    // Nothing implied, nothing shown; and a stored age is not inferred.
    expect(cell("ageYears", row(label(), null))).toMatchObject({ text: "—" });
    expect(cell("ageYears", row(label({ isStraight: true, ageYears: "9" }), null))).toEqual({ text: "9" });
  });
  it("shows the youngest age of a statement when no years are stored (a label from before years were filled in)", () => {
    expect(cell("ageYears", row(label({ ageStatement: "8 to 12 years" }), null))).toMatchObject({ text: "8", inferred: true });
  });
  it("shows a dash with the reason where the spirit does not use it", () => {
    const where = (kind: "tequila" | "vodka"): SheetContext => ({ ...ctx, kinds: { 5: kind } });
    expect(col("ageStatement").cell(row(label({ fieldGroup: "agave", tequilaClass: "reposado" }), null), where("tequila"))).toMatchObject({ text: "—", note: expect.any(String) });
    expect(col("ageYears").cell(row(label({ fieldGroup: "vodka" }), null), where("vodka"))).toMatchObject({ text: "—", note: expect.any(String) });
  });
});

describe("what locks what", () => {
  const age = EDITORS.ageYears!;
  const statement = EDITORS.ageStatement!;
  it("an entered age locks the statement, and typing the statement locks nothing in a whiskey (it fills the years in)", () => {
    expect(statement.lock!(row(label({ ageYears: "12" }), null), kinds)).toMatch(/Triple-click/);
    expect(statement.lock!(row(label(), null), kinds)).toBeNull();
    expect(age.lock!(row(label({ ageStatement: "12 Year" }), null), kinds)).toBeNull();
  });
  it("years derived from the statement do not lock it, and stay editable", () => {
    const derived = row(label({ ageYears: "12", ageYearsSource: "derived", ageStatement: "12 Year" }), null);
    expect(statement.lock!(derived, kinds)).toBeNull();
    expect(age.lock!(derived, kinds)).toBeNull();
  });
  it("outside whiskey a statement locks the age, and an age the statement", () => {
    const rum = (over: Record<string, unknown>) => row(label({ fieldGroup: "rum", ...over }), null);
    expect(age.lock!(rum({ ageStatement: "8 Year" }), { 5: "other" })).toMatch(/Triple-click/);
    expect(statement.lock!(rum({ ageYears: "8" }), { 5: "other" })).toMatch(/Triple-click/);
  });
  it("NAS locks all four", () => {
    for (const id of ["ageYears", "ageMonths", "ageDays", "ageStatement"]) expect(EDITORS[id]!.lock!(row(label({ isNas: true }), null), kinds)).toMatch(/NAS/);
  });
  it("a locked cell is not editable until it is triple-clicked, and opens only for that label and column", () => {
    const r = row(label({ ageYears: "12" }), null);
    expect(editorFor(col("ageStatement"), labelsOnly, r, undefined, kinds)).toBeNull();
    expect(isLocked(col("ageStatement"), labelsOnly, r, undefined, kinds)).toBe(true);
    const open = new Set([lockKeyOf(EDITORS.ageStatement!, r, "ageStatement")]);
    expect(editorFor(col("ageStatement"), labelsOnly, r, open, kinds)?.column).toBe("ageStatement");
    expect(isLocked(col("ageStatement"), labelsOnly, r, open, kinds)).toBe(false);
    expect(isLocked(col("ageMonths"), labelsOnly, r, open, kinds)).toBe(false);
  });
  it("a bottle's own cell opens for that bottle alone", () => {
    const a = row(label(), bottle({ id: 7, ageYears: "9" }));
    const b = row(label(), bottle({ id: 8, ageYears: "9" }));
    const open = new Set([lockKeyOf(EDITORS.ownAgeStatement!, a, "ownAgeStatement")]);
    expect(isLocked(col("ownAgeStatement"), both, a, open, kinds)).toBe(false);
    expect(isLocked(col("ownAgeStatement"), both, b, open, kinds)).toBe(true);
  });
});

describe("typing", () => {
  it("takes the form's own number rules, and years to one decimal", () => {
    const r = row(label(), null);
    const p = (id: string, text: string) => parseCell(EDITORS[id]!, text, "2026-01-01", r, kinds);
    expect(p("ageYears", "12.5")).toEqual({ ok: true, value: "12.5" });
    expect(p("ageYears", "12.55")).toMatchObject({ ok: false, message: expect.stringMatching(/decimal/) });
    expect(p("ageYears", "101")).toMatchObject({ ok: false });
    expect(p("ageMonths", "1.5")).toMatchObject({ ok: false });
    expect(p("ageMonths", "1201")).toMatchObject({ ok: false });
    expect(p("ageDays", "40001")).toMatchObject({ ok: false });
    expect(p("ageDays", "")).toEqual({ ok: true, value: "" });
  });
  it("shows the years a statement fills in at once, before the save, and an entered age is left alone", () => {
    const typed = applyEdits([row(label(), null)], { l1: { ageStatement: "8 to 12 years" } })[0]!.label;
    expect(typed).toMatchObject({ ageStatement: "8 to 12 years", ageYears: "8", ageYearsSource: "derived" });
    const kept = applyEdits([row(label({ ageYears: "10" }), null)], { l1: { ageStatement: "8 to 12 years" } })[0]!.label;
    expect(kept).toMatchObject({ ageYears: "10", ageStatement: "8 to 12 years" });
    const entered = applyEdits([row(typed, null)], { l1: { ageYears: "9" } })[0]!.label;
    expect(entered).toMatchObject({ ageYears: "9", ageYearsSource: "entered" });
  });
});

describe("a bottle's own age", () => {
  it("shows the label's in grey where it has none, and its own where it has", () => {
    const l = label({ ageYears: "12.0" });
    expect(cell("ownAgeYears", row(l, bottle()))).toEqual({ text: "12", muted: true });
    expect(cell("ownAgeYears", row(l, bottle({ ageYears: "9" })))).toEqual({ text: "9" });
    expect(EDITORS.ownAgeYears!.display("", ctx, row(l, bottle()))).toEqual({ text: "12", muted: true });
  });
  it("follows the bottle form's rules: none for a blanco or an unaged gin", () => {
    expect(editorFor(col("ownAgeYears"), { labels: false, bottles: true }, row(label({ fieldGroup: "agave", tequilaClass: "blanco" }), bottle()), undefined, { 5: "tequila" })).toBeNull();
    expect(editorFor(col("ownAgeYears"), { labels: false, bottles: true }, row(label({ fieldGroup: "gin" }), bottle()), undefined, { 5: "gin" })).toBeNull();
    expect(editorFor(col("ownAgeYears"), { labels: false, bottles: true }, row(label(), bottle()), undefined, kinds)?.column).toBe("ownAgeYears");
  });
});

describe("what the boxes hold when opened", () => {
  it("is the stored value as the form's own box holds it, so a clear is a real change", () => {
    const l = label({ ageYears: "12.5", ageMonths: 6, ageStatement: "Old Rare" });
    expect(EDITORS.ageYears!.initial(row(l, null))).toBe("12.5");
    expect(EDITORS.ageMonths!.initial(row(l, null))).toBe("6");
    expect(EDITORS.ageDays!.initial(row(l, null))).toBe("");
    expect(EDITORS.ageStatement!.initial(row(l, null))).toBe("Old Rare");
    expect(EDITORS.ownAgeYears!.initial(row(l, bottle({ ageYears: "9" })))).toBe("9");
  });
});
