import { describe, expect, it } from "vitest";
import { emptyDraft } from "../drafts";
import { settleDraft, type SettleData } from "../paste-rows";
import type { SheetLabel } from "../sheet";

const label = (id: number, brandId: number, name: string, categoryId: number) => ({ id, brandId, name, categoryId }) as unknown as SheetLabel;
const data: SettleData = {
  brands: [{ id: 1, name: "Four Roses" }, { id: 2, name: "Pursuit Spirits" }],
  labels: [label(10, 1, "Single Barrel", 5), label(11, 1, "Small Batch", 5)],
  categories: [{ id: 5, name: "Bourbon" }, { id: 6, name: "Rye" }],
  drafts: [],
};
const draft = emptyDraft("d1");

describe("what a pasted brand, label and category become on a new row", () => {
  it("takes a complete brand, then the brand's label, in the order the row needs them", () => {
    const out = settleDraft(draft, { brand: "four roses", name: "Single Barrel" }, data);
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
    expect(settleDraft(existing, { category: "Rye" }, data).draft.categoryId).toBe(5);
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
