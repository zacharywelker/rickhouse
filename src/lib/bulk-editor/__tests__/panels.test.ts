import { describe, expect, it } from "vitest";
import { applyEdits, applyLabelEdits, arrange } from "../changes";
import { copyText, matchName } from "../clipboard";
import { EDITORS, editorFor, isLocked, lockKeyOf } from "../editors";
import { LEFT_TO_THE_SINGLE_PAGES } from "../fields";
import { panelApplies } from "../panels";
import { labelPatchBody, serverFields } from "../save";
import { SHEET_COLUMNS, type SheetColumn, type SheetContext, type SheetLabel, type SheetRow } from "../sheet";

const label = (over: Record<string, unknown> = {}) => ({ id: 1, brand: "B", name: "L", category: "Bourbon", categoryId: 5, categorySlug: "bourbon", fieldGroup: "whiskey", regions: [], isAgedGin: false, proof: "100", sizeMl: 750, links: { distilleries: [], mashbills: [], finishes: [], ingredients: [] }, ...over }) as unknown as SheetLabel;
const row = (l = label()): SheetRow => ({ key: "l1", label: l, bottle: null });
const bottleRow = (l = label()): SheetRow => ({ key: "b7", label: l, bottle: { id: 7 } as never });
const col = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;
const ctx: SheetContext = { currency: "USD", kinds: { 5: "american" }, lists: { versions: { 1: ["Old Grand-Dad Bonded"] }, releases: { 1: ["2024 Spring", "2024 Fall"] } }, categories: { 5: "Bourbon", 6: "Scotch" } };
const labelsOnly = { labels: true, bottles: false };
const both = { labels: true, bottles: true };

describe("which labels have regions, older names and releases (the form's own rule)", () => {
  it("gives regions to Scotch only", () => {
    expect(panelApplies("regions", row(), { 5: "american" })).toBe(false);
    expect(panelApplies("regions", row(), { 5: "scotch" })).toBe(true);
  });
  it("gives older names and releases to a saved label, and releases not to vodka, amaro or liqueur", () => {
    expect(panelApplies("otherNames", row(), { 5: "american" })).toBe(true);
    expect(panelApplies("releases", row(), { 5: "american" })).toBe(true);
    for (const group of ["vodka", "amaro", "liqueur"]) expect(panelApplies("releases", row(label({ fieldGroup: group })), { 5: "other" })).toBe(false);
    const draft: SheetRow = { ...row(), draft: { brandChosen: true, labelChosen: true, brandIsNew: false, labelIsNew: true } };
    expect(panelApplies("otherNames", draft, { 5: "american" })).toBe(false);
    expect(panelApplies("releases", draft, { 5: "american" })).toBe(false);
  });
  it("is editable on a label row, and locked on a bottle row until triple-clicked, like the label's other facts", () => {
    expect(editorFor(col("otherNames"), labelsOnly, row(), undefined, ctx.kinds)?.panel).toBe("otherNames");
    expect(editorFor(col("otherNames"), both, bottleRow(), undefined, ctx.kinds)).toBeNull();
    expect(isLocked(col("otherNames"), both, bottleRow(), undefined, ctx.kinds)).toBe(true);
    const open = new Set([lockKeyOf(EDITORS.otherNames!, bottleRow(), "otherNames")]);
    expect(editorFor(col("otherNames"), both, bottleRow(), open, ctx.kinds)?.panel).toBe("otherNames");
  });
});

describe("what the cells show", () => {
  it("summarises what the label has, and what was edited", () => {
    expect(col("otherNames").cell(row(), ctx).text).toBe("Old Grand-Dad Bonded");
    expect(col("releases").cell(row(), ctx).text).toBe("2024 Spring, 2024 Fall");
    expect(col("regions").cell(row(label({ regions: ["Islay", "Speyside"] })), { ...ctx, kinds: { 5: "scotch" } }).text).toBe("Islay, Speyside");
    expect(EDITORS.otherNames!.display("Old One (1980–1995)\nOlder", ctx, row()).text).toBe("Old One, Older");
    expect(EDITORS.releases!.display(JSON.stringify([{ id: "1", name: "New Batch" }, { name: "" }]), ctx, row()).text).toBe("New Batch");
    expect(EDITORS.regions!.display("", ctx, row()).text).toBe("—");
  });
  it("says why a cell is empty where the spirit does not have it", () => {
    expect(col("regions").cell(row(), ctx)).toMatchObject({ text: "—", note: "Only for Scotch" });
  });
  it("is not written onto the row's own data, and copies what it shows", () => {
    const l = label();
    expect(applyEdits([row(l)], { l1: { otherNames: "X" } })[0]!.label).toBe(l);
    expect(copyText(EDITORS.releases!, "[]", { text: "2024 Spring, 2024 Fall" })).toBe("2024 Spring, 2024 Fall");
  });
});

describe("what a save sends", () => {
  it("sends the regions as the form writes them, the older names as lines, and the releases as the form's rows", () => {
    expect(labelPatchBody({ regions: "Islay, Speyside" })).toEqual({ regions: "Islay, Speyside" });
    expect(labelPatchBody({ regions: "" })).toEqual({ regions: null });
    expect(labelPatchBody({ otherNames: "Old (1980–1995)" })).toEqual({ otherNames: "Old (1980–1995)" });
    expect(labelPatchBody({ releases: '[{"name":"A"}]' })).toEqual({ releases: '[{"name":"A"}]' });
  });
});

describe("a saved label's category", () => {
  it("is kept as id:N, shown by name, and saved as the id", () => {
    expect(EDITORS.category!.display("id:6", ctx, row()).text).toBe("Scotch");
    expect(serverFields(EDITORS.category!, "category", "id:6")).toEqual({ categoryId: 6 });
    expect(labelPatchBody({ category: "id:6" })).toEqual({ categoryId: 6 });
  });
  it("changes which of the label's cells apply at once, keeping what is stored", () => {
    const info = { 5: { name: "Bourbon", group: "whiskey" as const }, 7: { name: "Rum", group: "rum" as const, slug: "rum" } };
    const rows = applyLabelEdits([row(label({ esterGl: "300" }))], { l1: { category: "id:7" } }, info);
    expect(rows[0]!.label).toMatchObject({ categoryId: 7, category: "Rum", fieldGroup: "rum", categorySlug: "rum", esterGl: "300" });
    expect(arrange([row()], {}, { l1: { category: "id:7" } }, [label()], info)[0]!.label.category).toBe("Rum");
    // Nothing is changed for a category that is not known, or a row that is not saved.
    expect(applyLabelEdits([row()], { l1: { category: "id:99" } }, info)[0]!.label.category).toBe("Bourbon");
  });
  it("is chosen by pasting a complete name, and is not offered a way to create one", () => {
    const cats = [{ id: 5, name: "Bourbon" }, { id: 6, name: "Scotch" }];
    expect(matchName("scotch", cats)).toEqual({ kind: "exact", match: cats[1] });
    expect(matchName("Scot", cats)).toEqual({ kind: "search" });
  });
});

describe("what is deliberately left to the single pages", () => {
  it("is written down, so the walk has a reviewed list", () => {
    expect(LEFT_TO_THE_SINGLE_PAGES.length).toBeGreaterThanOrEqual(5);
    expect(LEFT_TO_THE_SINGLE_PAGES.join(" ")).toMatch(/COLA/);
  });
});
