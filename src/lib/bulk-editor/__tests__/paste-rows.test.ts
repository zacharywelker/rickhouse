import { describe, expect, it } from "vitest";
import { emptyDraft } from "../drafts";
import { linesForNewRows, pastedDraftConflict, settleDraft, type SettleData } from "../paste-rows";
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

describe("which pasted lines become new rows", () => {
  const saved = { draft: undefined };
  const fresh = { draft: {} };
  // Two saved rows, a row inserted below them, two more saved rows, then the empty row at the bottom.
  const rows = [saved, saved, fresh, saved, saved, fresh];

  it("a line that lands on a saved row below an inserted row is written there and does not also become a new row", () => {
    expect(linesForNewRows(rows, 3, 4)).toEqual([2, 3]);
  });
  it("a block pasted across an inserted row makes a new row only for the line that landed on it", () => {
    expect(linesForNewRows(rows, 0, 4)).toEqual([2]);
  });
  it("lines past the last row and on the empty row become new rows, as before", () => {
    expect(linesForNewRows([saved, saved, fresh], 1, 4)).toEqual([1, 2, 3]);
    expect(linesForNewRows([saved, saved], 1, 3)).toEqual([1, 2]);
  });
  it("with every new row at the bottom it matches what pasting always did", () => {
    expect(linesForNewRows([saved, saved, saved, fresh], 0, 6)).toEqual([3, 4, 5]);
    expect(linesForNewRows([saved, saved, saved, fresh], 0, 2)).toEqual([]);
  });
});
