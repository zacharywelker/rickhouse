import { describe, expect, it } from "vitest";
import { emptyDraft, withBlankRow, type DraftRow, type Pick } from "../drafts";
import { bottlePatchBody, createBody, draftNeeds, draftTitle, failureColumn, labelPatchBody, nextDraftKey, noticeText, settleEdits, settleMoves, type Sent } from "../save";

const existing = (id: number, name: string): Pick => ({ kind: "existing", id, name });
const fresh = (name: string): Pick => ({ kind: "new", name });
const draft = (over: Partial<DraftRow> = {}): DraftRow => ({ ...emptyDraft("d0"), ...over });

describe("what a new row needs", () => {
  it("needs a brand, then a label, then (for a new label) a category", () => {
    expect(draftNeeds(draft())).toMatchObject({ column: "brand", action: "choose a brand" });
    expect(draftNeeds(draft({ brand: existing(1, "Four Roses") }))).toMatchObject({ column: "name" });
    expect(draftNeeds(draft({ brand: existing(1, "Four Roses"), label: fresh("Single Barrel") }))).toMatchObject({ column: "category", action: "select a category", short: "Needs a category" });
  });
  it("needs nothing more once it has them, and an existing label needs no category", () => {
    expect(draftNeeds(draft({ brand: fresh("X"), label: fresh("Y"), categoryId: 3 }))).toBeNull();
    expect(draftNeeds(draft({ brand: existing(1, "A"), label: existing(2, "B") }))).toBeNull();
  });
  it("names the row for the notice", () => {
    expect(draftTitle(draft({ brand: existing(1, "Four Roses"), label: fresh("Single Barrel") }))).toBe("Four Roses Single Barrel");
    expect(draftTitle(draft())).toBe("A new row");
  });
});

describe("the requests", () => {
  it("sends a saved bottle's own cells under the server's names, a blank as null, and a move as the label's id", () => {
    expect(bottlePatchBody({ pricePaid: "52", ownProof: "99", notes: "" }, 5)).toEqual({ pricePaid: "52", proof: "99", notes: null, expressionId: 5 });
    expect(bottlePatchBody({ pricePaid: "52" }, undefined)).toEqual({ pricePaid: "52" });
    expect(bottlePatchBody(undefined, 5)).toEqual({ expressionId: 5 });
  });
  it("sends a saved label's facts, a rename as name, and nothing from a bottle", () => {
    expect(labelPatchBody({ msrp: "59", name: "Select", brand: "Four Roses Distillery", proof: "" })).toEqual({ msrp: "59", name: "Select", brand: "Four Roses Distillery", proof: null });
  });
  it("creates a new label under a new brand, with its category, facts and bottle", () => {
    const body = createBody(draft({ brand: fresh("Zzyzx"), label: fresh("Cask One"), categoryId: 4 }), { proof: "101", pricePaid: "40", ownSize: "700" }, true);
    expect(body).toEqual({ brand: { name: "Zzyzx" }, label: { name: "Cask One", categoryId: 4, facts: { proof: "101" } }, bottle: { pricePaid: "40", sizeMl: "700" } });
  });
  it("uses ids for what exists, and sends an existing label no facts", () => {
    expect(createBody(draft({ brand: existing(1, "A"), label: existing(2, "B") }), { msrp: "9", pricePaid: "5" }, true)).toEqual({ brand: { id: 1 }, label: { id: 2 }, bottle: { pricePaid: "5" } });
  });
  it("leaves out the bottle in a Labels view unless something was typed into a bottle cell", () => {
    const d = draft({ brand: fresh("A"), label: fresh("B"), categoryId: 1 });
    expect(createBody(d, {}, false)).not.toHaveProperty("bottle");
    expect(createBody(d, { pricePaid: "3" }, false)).toHaveProperty("bottle", { pricePaid: "3" });
    expect(createBody(d, {}, true)).toHaveProperty("bottle", {});
  });
  it("never sends a blank or a pick as a value", () => {
    const body = createBody(draft({ brand: fresh("A"), label: fresh("B"), categoryId: 1 }), { pricePaid: "", brand: "A", name: "B", category: "Bourbon" }, true) as { bottle: object; label: { facts?: object } };
    expect(body.bottle).toEqual({});
    expect(body.label.facts).toBeUndefined();
  });
});

describe("which cell a failure belongs to", () => {
  it("maps the server's field to the column, keeping a bottle's own proof apart from the label's", () => {
    expect(failureColumn({ name: "Already taken." }, "label", "brand")).toBe("name");
    expect(failureColumn({ proof: "At most 200" }, "bottle", "brand")).toBe("ownProof");
    expect(failureColumn({ proof: "At most 200" }, "label", "brand")).toBe("proof");
    expect(failureColumn({ categoryId: "Choose a category." }, "label", "brand")).toBe("category");
  });
  it("falls back when the field has no column", () => {
    expect(failureColumn({ somethingElse: "x" }, "label", "brand")).toBe("brand");
    expect(failureColumn({}, "bottle", "name")).toBe("name");
  });
});

describe("the notice", () => {
  it("says what one row is waiting for", () => {
    expect(noticeText([{ key: "d0", title: "Four Roses Single Barrel", action: "select a category" }])).toBe("Four Roses Single Barrel cannot save until you select a category.");
  });
  it("says why a save failed", () => {
    expect(noticeText([{ key: "l1", title: "Four Roses Small Batch", message: "You already have Four Roses Single Barrel." }])).toBe("Four Roses Small Batch could not be saved: You already have Four Roses Single Barrel.");
  });
  it("counts several, with the first", () => {
    const text = noticeText([{ key: "d0", title: "A B", action: "select a category" }, { key: "d1", title: "C D", action: "choose a label" }]);
    expect(text).toBe("2 rows cannot save. First: A B cannot save until you select a category.");
  });
  it("is empty when nothing is blocked", () => expect(noticeText([])).toBe(""));
});

describe("after a save", () => {
  const sent = new Map<string, Sent>([["b7", { cells: { pricePaid: "52" }, move: 3 }]]);
  it("drops an edit that is what was sent, and keeps one typed again meanwhile or in another cell", () => {
    expect(settleEdits({ b7: { pricePaid: "52" } }, sent)).toEqual({});
    expect(settleEdits({ b7: { pricePaid: "60" } }, sent)).toEqual({ b7: { pricePaid: "60" } });
    expect(settleEdits({ b7: { pricePaid: "52", notes: "x" }, b8: { notes: "y" } }, sent)).toEqual({ b7: { notes: "x" }, b8: { notes: "y" } });
  });
  it("drops a move that was sent, and keeps a different one", () => {
    expect(settleMoves({ b7: 3 }, sent)).toEqual({});
    expect(settleMoves({ b7: 4 }, sent)).toEqual({ b7: 4 });
  });
});

describe("keys for new rows", () => {
  it("never reuses a key a draft still has after earlier ones were saved and removed", () => {
    expect(nextDraftKey([])).toBe("d0");
    expect(nextDraftKey([{ key: "d1" }])).toBe("d2");
    expect(withBlankRow([draft({ key: "d1" }), draft({ key: "d2" })]).map((d) => d.key)).toEqual(["d1", "d2", "d3"]);
  });
});
