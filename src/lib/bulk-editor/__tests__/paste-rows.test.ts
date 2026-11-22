import { describe, expect, it } from "vitest";
import { emptyDraft } from "../drafts";
import { replaceChosen, routePasteRows, pastedDraftConflict, settleDraft, type SettleData } from "../paste-rows";
import type { SheetLabel } from "../sheet";

const label = (id: number, brandId: number, name: string, categoryId: number) => ({ id, brandId, name, categoryId }) as unknown as SheetLabel;
const data: SettleData = {
  bottles: true,
  brands: [{ id: 1, name: "Four Roses" }, { id: 2, name: "Pursuit Spirits" }],
  labels: [label(10, 1, "Single Barrel", 5), label(11, 1, "Small Batch", 5)],
  categories: [{ id: 5, name: "Bourbon" }, { id: 6, name: "Rye" }],
  drafts: [],
};
const draft = emptyDraft("d1");

describe("what a pasted brand, label and category become on a new row", () => {
  it("takes a complete brand, then the brand's label, in the order the row needs them", () => {
    const out = settleDraft(draft, { brand: "four roses", name: "Single Barrel", category: "bourbon" }, data);
    expect(out.draft.brand).toEqual({ kind: "existing", id: 1, name: "Four Roses" });
    expect(out.draft.label).toEqual({ kind: "existing", id: 10, name: "Single Barrel" });
    expect(out.draft.categoryId).toBe(5); // an existing label brings its own
    expect(out.left).toEqual({});
  });
  it("leaves a part of a brand to be chosen, and the label waits for it", () => {
    const out = settleDraft(draft, { brand: "Four", name: "Single Barrel", category: "Bourbon" }, data);
    expect(out.draft.brand).toBeNull();
    expect(out.left).toEqual({ brand: "Four", name: "Single Barrel", category: "Bourbon" });
  });
  it("leaves a label that does not exist to be chosen (or created, deliberately), never creating it", () => {
    const out = settleDraft(draft, { brand: "Four Roses", name: "Brand New Label", category: "Bourbon" }, data);
    expect(out.draft.brand).toMatchObject({ kind: "existing", id: 1 });
    expect(out.draft.label).toBeNull();
    expect(out.left).toEqual({ name: "Brand New Label", category: "Bourbon" });
  });
  it("carries on once a choice has been made: the label, then the category of a new label", () => {
    const chosen = { ...draft, brand: { kind: "existing", id: 1, name: "Four Roses" } as const };
    const afterLabel = settleDraft(chosen, { name: "Small Batch" }, data);
    expect(afterLabel.draft.label).toMatchObject({ kind: "existing", id: 11 });
    const made = { ...chosen, label: { kind: "new", name: "Fresh" } as const };
    const afterCategory = settleDraft(made, { category: "rye" }, data);
    expect(afterCategory.draft.categoryId).toBe(6);
    expect(afterCategory.left).toEqual({});
  });
  it("does not set a category on a label that exists, or one that does not match", () => {
    const made = { ...draft, brand: { kind: "existing", id: 1, name: "Four Roses" } as const, label: { kind: "new", name: "Fresh" } as const };
    expect(settleDraft(made, { category: "Bourb" }, data)).toMatchObject({ left: { category: "Bourb" } });
    const existing = { ...draft, brand: { kind: "existing", id: 1, name: "Four Roses" } as const, label: { kind: "existing", id: 10, name: "Single Barrel" } as const, categoryId: 5 };
    const mismatched = settleDraft(existing, { category: "Rye" }, data);
    expect(mismatched.draft.categoryId).toBe(5);
    expect(mismatched.left).toEqual({ category: "Rye" });
    expect(pastedDraftConflict(mismatched.draft, mismatched.left, data)).toEqual({
      column: "category",
      message: "The existing label uses Bourbon. Clear the pasted category with Delete, or choose a different label.",
    });
    const corrected = settleDraft(existing, { category: "Bourbon" }, data);
    expect(pastedDraftConflict(corrected.draft, corrected.left, data)).toBeNull();
  });
  it("keeps an existing label unresolved when the sheet is adding labels only", () => {
    const labelsOnly = { ...data, bottles: false };
    const out = settleDraft(draft, { brand: "Four Roses", name: "Single Barrel", category: "Bourbon" }, labelsOnly);
    expect(out.draft.label).toBeNull();
    expect(out.left).toEqual({ name: "Single Barrel", category: "Bourbon" });
    expect(pastedDraftConflict(out.draft, out.left, labelsOnly)).toMatchObject({
      column: "name",
      message: "That label already exists. Switch Bottles on to add a bottle of it.",
    });
    const bottlesOn = settleDraft(out.draft, out.left, data);
    expect(bottlesOn.draft.label).toMatchObject({ kind: "existing", id: 10 });
    expect(bottlesOn.left).toEqual({});
  });
  it("shares a brand another new row has named, so the same new brand is picked and not typed twice", () => {
    const other = { ...emptyDraft("d0"), brand: { kind: "new", name: "Brand Of Mine" } as const };
    const out = settleDraft(draft, { brand: "brand of mine" }, { ...data, drafts: [other] });
    expect(out.draft.brand).toEqual({ kind: "new", name: "Brand Of Mine" });
  });
  it("forgets a blank text", () => {
    expect(settleDraft(draft, { brand: "—", name: "" }, data).left).toEqual({});
  });
});

describe("which new row each pasted line lands on", () => {
  const rows = [
    { key: "b1", draft: undefined },
    { key: "b2", draft: undefined },
    { key: "d1", draft: {} },
    { key: "b3", draft: undefined },
    { key: "b4", draft: undefined },
    { key: "d2", draft: {} },
  ];

  it("skips saved rows below an insert, then fills the empty row and goes past the end", () => {
    expect(routePasteRows(rows, 3, 4)).toEqual([{ line: 2, into: "d2" }, { line: 3, into: null }]);
  });
  it("routes only the line that lands on the inserted row", () => {
    expect(routePasteRows(rows, 0, 4)).toEqual([{ line: 2, into: "d1" }]);
  });
  it("skips the final saved row before filling the empty row and going past the end", () => {
    expect(routePasteRows(rows, 4, 3)).toEqual([{ line: 1, into: "d2" }, { line: 2, into: null }]);
  });
  it("returns no routes for a paste over saved rows only", () => {
    expect(routePasteRows(rows, 0, 2)).toEqual([]);
  });
  it("starts on the empty row and routes the next line past the end", () => {
    expect(routePasteRows(rows, 5, 2)).toEqual([{ line: 0, into: "d2" }, { line: 1, into: null }]);
  });
  it("returns no routes for zero pasted rows", () => {
    expect(routePasteRows(rows, 0, 0)).toEqual([]);
  });
});

describe("what a paste replaces on a new row that has already chosen", () => {
  const existing = (id: number, name: string) => ({ kind: "existing" as const, id, name });
  const chosen = { ...emptyDraft("d4"), brand: existing(1, "Four Roses"), label: existing(10, "Single Barrel"), categoryId: 5, insertAfter: "b9", prefilled: true as const };

  it("a different brand drops the label and category that belonged to the old one, and the row keeps its place", () => {
    const out = replaceChosen(chosen, { brand: "Pursuit Spirits" }, data);
    expect(out.draft).toMatchObject({ key: "d4", brand: null, label: null, categoryId: null, insertAfter: "b9" });
    expect(out.draft.prefilled).toBeUndefined();
    expect(out.texts).toEqual({ brand: "Pursuit Spirits" });
  });
  it("the same brand, in any case, changes nothing, and is not waited on", () => {
    const out = replaceChosen(chosen, { brand: "four roses" }, data);
    expect(out.draft).toEqual(chosen);
    expect(out.texts).toEqual({});
  });
  it("a different label drops its category but keeps the brand", () => {
    const out = replaceChosen(chosen, { name: "Small Batch" }, data);
    expect(out.draft).toMatchObject({ brand: existing(1, "Four Roses"), label: null, categoryId: null });
    expect(out.texts).toEqual({ name: "Small Batch" });
  });
  it("the same label changes nothing, and is not waited on", () => {
    const out = replaceChosen(chosen, { name: "single barrel" }, data);
    expect(out.draft).toEqual(chosen);
    expect(out.texts).toEqual({});
  });
  it("a text for a level that was never chosen is left for settleDraft", () => {
    const bare = { ...emptyDraft("d5"), brand: existing(1, "Four Roses") };
    const out = replaceChosen(bare, { name: "Small Batch", category: "Rye" }, data);
    expect(out.draft).toEqual(bare);
    expect(out.texts).toEqual({ name: "Small Batch", category: "Rye" });
  });
  it("a new label's category is replaced by a different one, and kept when it is the same", () => {
    const fresh = { ...emptyDraft("d6"), brand: existing(1, "Four Roses"), label: { kind: "new" as const, name: "Zed" }, categoryId: 5 };
    expect(replaceChosen(fresh, { category: "Rye" }, data).draft.categoryId).toBeNull();
    expect(replaceChosen(fresh, { category: "Rye" }, data).texts).toEqual({ category: "Rye" });
    const same = replaceChosen(fresh, { category: "bourbon" }, data);
    expect(same.draft.categoryId).toBe(5);
    expect(same.texts).toEqual({});
  });
  it("an existing label's category is not the row's to replace", () => {
    const out = replaceChosen(chosen, { category: "Rye" }, data);
    expect(out.draft.categoryId).toBe(5);
    expect(out.texts).toEqual({ category: "Rye" });
  });
  it("a new label given the same name again keeps it", () => {
    const fresh = { ...emptyDraft("d7"), brand: existing(1, "Four Roses"), label: { kind: "new" as const, name: "Zed" }, categoryId: 5 };
    const out = replaceChosen(fresh, { name: "zed" }, data);
    expect(out.draft).toEqual(fresh);
    expect(out.texts).toEqual({});
  });
  it("with nothing pasted nothing changes", () => {
    const out = replaceChosen(chosen, {}, data);
    expect(out.draft).toEqual(chosen);
    expect(out.texts).toEqual({});
  });
});
