import { describe, expect, it } from "vitest";
import { sortRows } from "../find";
import { indexSheet } from "../resolve";
import { copyValue } from "../value-cells";
import { DEFAULT_HIDDEN, columnsFor, SHEET_COLUMNS, type SheetBottle, type SheetContext, type SheetLabel, type SheetRow, type SheetVintage } from "../sheet";

const label = (over: Record<string, unknown> = {}) =>
  ({ id: 1, brand: "Pinhook", name: "Vertical", categoryId: 5, category: "Bourbon", fieldGroup: "whiskey", proof: "90", sizeMl: 750, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", isNas: false, isStraight: false, isBottledInBond: false, isCaskStrength: false, tequilaClass: null, brandyGrade: null, links: { distilleries: [], mashbills: [], finishes: [] }, ...over }) as unknown as SheetLabel;
const bottle = (over: Record<string, unknown> = {}) =>
  ({ id: 7, expressionId: 1, releaseId: null, proof: null, sizeMl: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", ginIsNas: null, tequilaClass: null, brandyGrade: null, isSingleBarrel: false, isSingleBarrelPick: false, ...over }) as unknown as SheetBottle;
const vintage = (over: Record<string, unknown> = {}): SheetVintage => ({ id: 70, labelId: 1, name: "2021", proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", ...over }) as SheetVintage;
const row = (l: SheetLabel, b: SheetBottle | null): SheetRow => ({ key: b ? `b${b.id}` : `l${l.id}`, label: l, bottle: b });
const col = (id: string) => SHEET_COLUMNS.find((c) => c.id === id)!;

const FIRST = ["brand", "name", "category", "releaseId", "singleBarrel", "privateSelection", "sizeMl", "proof", "abv", "ageYears", "ageMonths", "ageDays", "ageStatement"];

describe("one Size, Proof and Age column, in the new order", () => {
  it("lists Brand, Label, Category, Vintage, Single barrel, Private selection, then the values, in the view that shows bottles", () => {
    expect(columnsFor({ labels: true, bottles: true }, DEFAULT_HIDDEN).map((c) => c.id).slice(0, FIRST.length)).toEqual(FIRST);
  });
  it("keeps the values in the Bottles-only and Labels-only views, which have no Vintage or pick columns to show", () => {
    const only = (v: { labels: boolean; bottles: boolean }) => columnsFor(v, DEFAULT_HIDDEN).map((c) => c.id);
    expect(only({ labels: false, bottles: true })).toEqual(expect.arrayContaining(["brand", "name", "releaseId", "singleBarrel", "privateSelection", "sizeMl", "proof", "abv", "ageYears", "ageStatement"]));
    expect(only({ labels: true, bottles: false })).toEqual(expect.arrayContaining(["category", "sizeMl", "proof", "abv", "ageYears", "ageMonths", "ageDays", "ageStatement"]));
    expect(only({ labels: true, bottles: false })).not.toContain("releaseId");
  });
  it("no longer has a column for this bottle's own proof, size or age", () => {
    const ids = SHEET_COLUMNS.map((c) => c.id);
    for (const gone of ["ownProof", "ownSize", "ownAgeYears", "ownAgeMonths", "ownAgeDays", "ownAgeStatement"]) expect(ids).not.toContain(gone);
  });
  it("calls the release column Vintage", () => {
    expect(col("releaseId").label).toBe("Vintage");
  });
});

describe("what the value cells show", () => {
  const l = label();
  const v = vintage({ proof: "112", ageYears: "7" });
  const b = bottle({ releaseId: 70 });
  const ctx: SheetContext = { currency: "USD", kinds: { 5: "american" }, index: indexSheet([l], [b], [v]) };
  it("shows a bottle on a vintage the vintage's proof, age and ABV, each with the V marker", () => {
    expect(col("proof").cell(row(l, b), ctx)).toMatchObject({ text: "112", marker: "V" });
    expect(col("abv").cell(row(l, b), ctx)).toMatchObject({ text: "56", marker: "V" });
    expect(col("ageYears").cell(row(l, b), ctx)).toMatchObject({ text: "7", marker: "V" });
  });
  it("shows the label's own value with no marker", () => {
    const plain = bottle();
    expect(col("proof").cell(row(l, plain), ctx)).toEqual({ text: "90" });
    expect(col("sizeMl").cell(row(l, plain), ctx)).toEqual({ text: "750 mL" });
  });
  it("says Varies, muted, for a label whose vintages disagree, and flags the cell so a copy leaves it blank", () => {
    const empty = label({ proof: null });
    const c = { ...ctx, index: indexSheet([empty], [], [vintage({ proof: "112" }), vintage({ id: 71, name: "2022", proof: "107.4" })]) };
    expect(col("proof").cell(row(empty, null), c)).toMatchObject({ text: "Varies", muted: true, varies: true });
  });
});

describe("sorting by a value column uses what the cell shows", () => {
  it("orders by the resolved proof, and puts Varies and blank last", () => {
    const l = label();
    const a = bottle({ id: 1, releaseId: 70 });
    const bb = bottle({ id: 2 });
    const c = bottle({ id: 3, proof: "130" });
    const ctx = { kinds: { 5: "american" }, index: indexSheet([l], [a, bb, c], [vintage({ proof: "112" })]) } as never;
    const rows = [row(l, bb), row(l, c), row(l, a)];
    const sorted = sortRows(rows, { column: "proof", desc: false }, new Map(), ctx).map((r) => r.bottle!.id);
    expect(sorted).toEqual([2, 1, 3]); // 90 (the label's), 112 (the vintage's), 130 (its own)
  });
});

describe("copying a value cell", () => {
  it("copies the value the cell shows, as a plain number, and nothing for Varies", () => {
    const l = label();
    const b = bottle({ releaseId: 70 });
    const ctx: SheetContext = { currency: "USD", kinds: { 5: "american" }, index: indexSheet([l], [b], [vintage({ proof: "112" })]) };
    expect(copyValue("proof", row(l, b), ctx)).toBe("112");
    expect(copyValue("abv", row(l, b), ctx)).toBe("56");
    expect(copyValue("sizeMl", row(l, b), ctx)).toBe("750");
    const empty = label({ proof: null });
    const varying: SheetContext = { ...ctx, index: indexSheet([empty], [], [vintage({ proof: "112" }), vintage({ id: 71, name: "2022", proof: "107.4" })]) };
    expect(copyValue("proof", row(empty, null), varying)).toBe("");
  });
});

describe("tequila class, brandy grade and gin NAS: one cell each", () => {
  const agave = label({ id: 2, fieldGroup: "agave", categoryId: 30, tequilaClass: "blanco" });
  const kinds = { 30: "tequila" } as never;
  const ctxOf = (l: SheetLabel, bs: SheetBottle[]): SheetContext => ({ currency: "USD", kinds, index: indexSheet([l], bs, []) });

  it("has a column for each, and none for the bottle's own", () => {
    const ids = SHEET_COLUMNS.map((c) => c.id);
    for (const id of ["tequilaClass", "brandyGrade", "isNas"]) expect(ids).toContain(id);
    for (const gone of ["ownTequilaClass", "ownBrandyGrade", "ginIsNas"]) expect(ids).not.toContain(gone);
    // The bottle has no designation of its own any more, so the brandy designation is the label's plain column.
    for (const id of ["tequilaClass", "isNas"]) expect(col(id).group).toBe("value");
    expect(col("brandyGrade").group).not.toBe("value");
  });
  it("shows the label's tequila class with no marker, and a bottle's own with a B", () => {
    const plain = bottle({ id: 8, expressionId: 2 });
    const own = bottle({ id: 9, expressionId: 2, tequilaClass: "reposado" });
    expect(col("tequilaClass").cell(row(agave, plain), ctxOf(agave, [plain]))).toMatchObject({ text: expect.stringContaining("Blanco") });
    expect(col("tequilaClass").cell(row(agave, plain), ctxOf(agave, [plain])).marker).toBeUndefined();
    expect(col("tequilaClass").cell(row(agave, own), ctxOf(agave, [own]))).toMatchObject({ text: expect.stringContaining("Reposado"), marker: "B" });
  });
  it("says it is not used where the spirit has no such field", () => {
    const whiskey = label();
    const cell = col("tequilaClass").cell(row(whiskey, bottle()), { currency: "USD", kinds: { 5: "american" } as never, index: indexSheet([whiskey], [], []) });
    expect(cell).toMatchObject({ text: "—" });
    expect(cell.note).toBeTruthy();
  });
  it("shows a gin bottle's own NAS over the label's", () => {
    const gin = label({ id: 3, fieldGroup: "gin", categoryId: 40, isNas: false, isAgedGin: true });
    const b = bottle({ id: 10, expressionId: 3, ginIsNas: true });
    const c = { currency: "USD", kinds: { 40: "gin" } as never, index: indexSheet([gin], [b], []) };
    expect(col("isNas").cell(row(gin, b), c)).toMatchObject({ text: "Yes", marker: "B" });
    expect(col("isNas").cell(row(gin, bottle({ id: 11, expressionId: 3 })), c)).toEqual({ text: "—", muted: true });
  });
});
