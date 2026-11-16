import { describe, expect, it } from "vitest";
import {
  brandCandidates, categoryCandidates, countNewRows, draftSheetRow, emptyDraft, isBlank, labelCandidates, pickOf, samePick, withBlankRow, withBrand, withCategory, withLabel,
  type DraftRow, type Pick,
} from "../drafts";
import { SHEET_COLUMNS, type SheetLabel } from "../sheet";

const existing = (id: number, name: string): Pick => ({ kind: "existing", id, name });
const fresh = (name: string): Pick => ({ kind: "new", name });
const label = (id: number, brandId: number, brand: string, name: string, categoryId = 5): SheetLabel =>
  ({ id, brandId, brand, name, category: "Bourbon", categoryId, fieldGroup: "whiskey", proof: "100.0", sizeMl: 750, links: { distilleries: [], mashbills: [], finishes: [] } }) as unknown as SheetLabel;
const labels = [label(1, 10, "Four Roses", "Single Barrel"), label(2, 10, "Four Roses", "Small Batch"), label(3, 11, "Weller", "12 Antique", 6)];
const categories = [{ id: 5, name: "Bourbon", hint: "in Whiskey" }, { id: 6, name: "Rye" }];
const ctx = (bottles = true) => ({ view: { labels: true, bottles }, labels, categories, groups: { 5: "whiskey", 6: "whiskey" } as const });
const draft = (over: Partial<DraftRow> = {}): DraftRow => ({ ...emptyDraft("d0"), ...over });

describe("picks", () => {
  it("are the same by id when they exist, and by name in any case when they do not", () => {
    expect(samePick(existing(1, "A"), existing(1, "B"))).toBe(true);
    expect(samePick(existing(1, "A"), existing(2, "A"))).toBe(false);
    expect(samePick(fresh("Four Roses"), fresh("four roses "))).toBe(true);
    expect(samePick(fresh("Four Roses"), existing(1, "Four Roses"))).toBe(false);
    expect(samePick(null, null)).toBe(true);
    expect(samePick(null, fresh("x"))).toBe(false);
  });
  it("come from a suggestion: one with an id exists, one that only this sheet knows is new", () => {
    expect(pickOf({ id: 4, name: "Weller", near: false })).toEqual({ kind: "existing", id: 4, name: "Weller" });
    expect(pickOf({ id: null, name: "Pick", near: false })).toEqual({ kind: "new", name: "Pick" });
    expect(pickOf({ name: "Typed" })).toEqual({ kind: "new", name: "Typed" });
  });
});

describe("choosing", () => {
  it("a different brand empties the label and category; the same brand keeps them", () => {
    const row = draft({ brand: existing(10, "Four Roses"), label: existing(1, "Single Barrel"), categoryId: 5 });
    expect(withBrand(row, existing(10, "Four Roses"))).toBe(row);
    expect(withBrand(row, existing(11, "Weller"))).toMatchObject({ brand: existing(11, "Weller"), label: null, categoryId: null });
  });
  it("an existing label brings its category; a new one starts with none and is never given one", () => {
    const row = draft({ brand: existing(10, "Four Roses") });
    expect(withLabel(row, existing(1, "Single Barrel"), 5)).toMatchObject({ categoryId: 5 });
    expect(withLabel(withCategory(row, 6), fresh("Private Pick"), null)).toMatchObject({ categoryId: null });
  });
  it("switching from an existing label to a new one drops the category that came with the old one", () => {
    const row = withLabel(draft({ brand: existing(10, "Four Roses") }), existing(1, "Single Barrel"), 5);
    expect(withLabel(row, fresh("New One"), null).categoryId).toBeNull();
  });
  it("choosing the same label again changes nothing, so a typed category is kept", () => {
    const row = withCategory(withLabel(draft({ brand: fresh("B") }), fresh("L"), null), 6);
    expect(withLabel(row, fresh("l"), null)).toBe(row);
    expect(withCategory(row, 6)).toBe(row);
  });
});

describe("blank and new rows", () => {
  it("a row is blank until something is chosen or typed in it", () => {
    expect(isBlank(draft(), {})).toBe(true);
    expect(isBlank(draft({ brand: fresh("B") }), {})).toBe(false);
    expect(isBlank(draft(), { d0: { pricePaid: "5" } })).toBe(false);
  });
  it("counts only the new rows with something in them", () => {
    const drafts = [draft({ key: "d0", brand: fresh("B") }), draft({ key: "d1" }), draft({ key: "d2" })];
    expect(countNewRows(drafts, { d2: { notes: "x" } })).toBe(2);
  });
  it("always ends with an empty row to type into, keyed after the others", () => {
    expect(withBlankRow([]).map((d) => d.key)).toEqual(["d0"]);
    const rows = withBlankRow([draft({ key: "d0", brand: fresh("B") })]);
    expect(rows.map((d) => d.key)).toEqual(["d0", "d1"]);
    expect(isBlank(rows[1]!, {})).toBe(true);
  });
});

describe("what each cell offers", () => {
  it("brands: the ones that exist, plus ones another new row has named, once", () => {
    const drafts = [draft({ key: "d0", brand: fresh("Four Roses") }), draft({ key: "d1", brand: fresh("Elijah Craig") }), draft({ key: "d2", brand: fresh("elijah craig") })];
    const names = brandCandidates([{ id: 10, name: "Four Roses" }], drafts, "d2");
    expect(names).toEqual([{ id: 10, name: "Four Roses" }, { id: null, name: "Elijah Craig" }]);
  });
  it("labels: nothing until a brand is chosen", () => {
    expect(labelCandidates(draft(), labels, [])).toEqual([]);
  });
  it("labels: the chosen brand's own, and no other brand's", () => {
    const names = labelCandidates(draft({ brand: existing(10, "Four Roses") }), labels, []).map((c) => c.name);
    expect(names).toEqual(["Single Barrel", "Small Batch"]);
  });
  it("labels: a label another new row named under the same brand is offered, so the same new label is picked and not typed twice", () => {
    const other = draft({ key: "d0", brand: existing(10, "Four Roses"), label: fresh("Private Pick") });
    const mine = draft({ key: "d1", brand: existing(10, "Four Roses") });
    expect(labelCandidates(mine, labels, [other, mine]).map((c) => c.name)).toEqual(["Single Barrel", "Small Batch", "Private Pick"]);
    expect(labelCandidates(other, labels, [other, mine]).map((c) => c.name)).toEqual(["Single Barrel", "Small Batch"]);
  });
  it("labels: under a new brand, only labels other new rows put under that same new brand", () => {
    const other = draft({ key: "d0", brand: fresh("Brand New"), label: fresh("First") });
    const mine = draft({ key: "d1", brand: fresh("brand new") });
    expect(labelCandidates(mine, labels, [other, mine])).toEqual([{ id: null, name: "First" }]);
    expect(labelCandidates(draft({ key: "d1", brand: fresh("Elsewhere") }), labels, [other])).toEqual([]);
  });
  it("categories keep their hint", () => {
    expect(categoryCandidates(categories)).toEqual([{ id: 5, name: "Bourbon", hint: "in Whiskey" }, { id: 6, name: "Rye" }]);
  });
});

describe("a draft as a sheet row", () => {
  const cellText = (row: ReturnType<typeof draftSheetRow>, id: string) => SHEET_COLUMNS.find((c) => c.id === id)!.cell(row, { currency: "USD", kinds: {} });

  it("an empty row says what it is for", () => {
    expect(cellText(draftSheetRow(draft(), ctx()), "brand")).toEqual({ text: "Add a bottle", muted: true });
    expect(cellText(draftSheetRow(draft(), ctx(false)), "brand")).toEqual({ text: "Add a label", muted: true });
  });
  it("a new brand and a new label are tagged, with the category once it is typed", () => {
    const row = draftSheetRow(draft({ brand: fresh("Brand New"), label: fresh("Label New"), categoryId: 6 }), ctx());
    expect(cellText(row, "brand")).toEqual({ text: "Brand New", badge: "new" });
    expect(cellText(row, "name")).toEqual({ text: "Label New", badge: "new" });
    expect(cellText(row, "category")).toEqual({ text: "Rye" });
    expect(row.draft).toEqual({ brandChosen: true, labelChosen: true, brandIsNew: true, labelIsNew: true });
  });
  it("an existing label is shown as it is, with no tags", () => {
    const row = draftSheetRow(draft({ brand: existing(10, "Four Roses"), label: existing(1, "Single Barrel"), categoryId: 5 }), ctx());
    expect(row.label).toBe(labels[0]);
    expect(cellText(row, "brand")).toEqual({ text: "Four Roses" });
    expect(cellText(row, "proof")).toEqual({ text: "100" });
    expect(row.draft).toMatchObject({ brandIsNew: false, labelIsNew: false, labelChosen: true });
  });
  it("has a bottle only where the sheet is one row per bottle", () => {
    expect(draftSheetRow(draft(), ctx(true)).bottle).not.toBeNull();
    expect(draftSheetRow(draft(), ctx(false)).bottle).toBeNull();
  });
  it("a category not yet chosen shows as empty", () => {
    expect(cellText(draftSheetRow(draft({ brand: fresh("B"), label: fresh("L") }), ctx()), "category")).toEqual({ text: "—", muted: true });
  });
});
