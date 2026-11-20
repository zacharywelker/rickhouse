import { describe, expect, it } from "vitest";
import type { DraftRow, Pick } from "../drafts";
import { expandPrefill, expandSteps, expandStepsForDraft } from "../expand";
import type { SheetRow, SheetView } from "../sheet";

const LABELS: SheetView = { labels: true, bottles: false };
const BOTTLES: SheetView = { labels: false, bottles: true };
const BOTH: SheetView = { labels: true, bottles: true };

const saved = (bottle: boolean): SheetRow => ({ key: bottle ? "b12" : "l7", label: { id: 7 }, bottle: bottle ? { id: 12 } : null }) as unknown as SheetRow;
const draft = { key: "d0", label: { id: -1 }, bottle: null, draft: { brandChosen: false, labelChosen: false, brandIsNew: false, labelIsNew: false } } as unknown as SheetRow;

describe("where a saved row expands to", () => {
  it("is the label's edit page when only Labels is on", () => {
    expect(expandSteps(saved(false), LABELS)).toEqual(["/expressions/7/edit"]);
  });
  it("is the bottle's edit page when only Bottles is on", () => {
    expect(expandSteps(saved(true), BOTTLES)).toEqual(["/bottles/12/edit"]);
  });
  it("is the label's edit page and then the bottle's when both are on", () => {
    expect(expandSteps(saved(true), BOTH)).toEqual(["/expressions/7/edit", "/bottles/12/edit"]);
  });
  it("is the label's edit page alone when both are on and the row has no bottle", () => {
    expect(expandSteps(saved(false), BOTH)).toEqual(["/expressions/7/edit"]);
  });
});

describe("a new row", () => {
  it("has no steps here: its pages need what it has typed (see expandStepsForDraft)", () => {
    expect(expandSteps(draft, BOTH)).toBeNull();
  });
});

const existing = (id: number, name: string): Pick => ({ kind: "existing", id, name });
const fresh = (name: string): Pick => ({ kind: "new", name });
const newRow = (over: Partial<DraftRow> = {}): DraftRow => ({ key: "d1", brand: null, label: null, categoryId: null, ...over });

describe("what a new row hands to the form", () => {
  it("is an existing brand and a new label name, with no category (the case that cannot be saved from the sheet)", () => {
    expect(expandPrefill(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch") }), undefined, undefined, BOTH)).toEqual({
      label: { brandId: 10, name: "Zed Batch" },
      bottle: {},
      dropped: [],
      newBrand: null,
    });
  });
  it("names a brand that does not exist yet, for the sheet to create first, and never makes up an id for it", () => {
    const prefill = expandPrefill(newRow({ brand: fresh("Zed"), label: fresh("Zed Batch") }), undefined, undefined, BOTH);
    expect(prefill.newBrand).toBe("Zed");
    expect("brandId" in prefill.label).toBe(false);
    expect(prefill.label.name).toBe("Zed Batch");
  });
  it("carries a category that was chosen", () => {
    expect(expandPrefill(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch"), categoryId: 5 }), undefined, undefined, BOTH).label.categoryId).toBe(5);
  });
  it("puts each typed cell on the label or the bottle, as the saver would", () => {
    const prefill = expandPrefill(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch") }), { proof: "101", pricePaid: "45", notes: "n" }, undefined, BOTH);
    expect(prefill.label).toMatchObject({ proof: "101" });
    expect(prefill.bottle).toEqual({ pricePaid: "45", notes: "n" });
    expect(prefill.dropped).toEqual([]);
  });
  it("carries only the bottle's cells for a label that exists: the page opens with that label chosen", () => {
    const prefill = expandPrefill(newRow({ brand: existing(10, "Four Roses"), label: existing(1, "Single Barrel"), categoryId: 5 }), { pricePaid: "45" }, undefined, BOTH);
    expect(prefill.label).toEqual({});
    expect(prefill.bottle).toEqual({ pricePaid: "45" });
  });
  it("fills the brand and label from waiting text only where the row has chosen none", () => {
    expect(expandPrefill(newRow(), undefined, { brand: "Zed", name: "Zed Batch" }, BOTH)).toMatchObject({ newBrand: "Zed", label: { name: "Zed Batch" } });
    const chosen = expandPrefill(newRow({ brand: existing(10, "Four Roses") }), undefined, { brand: "Zed", name: "Zed Batch" }, BOTH);
    expect(chosen.newBrand).toBeNull();
    expect(chosen.label).toEqual({ brandId: 10, name: "Zed Batch" });
  });
  it("names typed bottle cells as not carried when the view has no bottle form to take them, and still carries the label's", () => {
    const prefill = expandPrefill(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch") }), { pricePaid: "45", proof: "101" }, undefined, LABELS);
    expect(prefill.bottle).toEqual({});
    expect(prefill.dropped).toEqual(["Price paid"]);
    expect(prefill.label).toMatchObject({ proof: "101" });
  });
  it("names a typed value the form has no field for, instead of dropping it silently", () => {
    const prefill = expandPrefill(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch") }), { pricePaid: "45", releaseId: "new:Spring" }, undefined, BOTH);
    expect(prefill.bottle).toEqual({ pricePaid: "45" });
    expect(prefill.dropped).toHaveLength(1);
    expect(prefill.dropped[0]).toMatch(/vintage|release/i);
  });
});

describe("where a new row expands to", () => {
  const T = "tok";
  it("is the New Label form for a new label when only Labels is on, and the label's page if the row named one that exists", () => {
    expect(expandStepsForDraft(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch") }), LABELS, T)).toEqual(["/expressions/new?prefill=tok"]);
    expect(expandStepsForDraft(newRow({ brand: existing(10, "Four Roses") }), LABELS, T)).toEqual(["/expressions/new?prefill=tok"]);
    expect(expandStepsForDraft(newRow({ brand: existing(10, "Four Roses"), label: existing(9, "Small Batch") }), LABELS, T)).toEqual(["/expressions/9/edit"]);
  });
  it("is the add-bottle page for a label that exists when only Bottles is on, and nothing for a new label", () => {
    expect(expandStepsForDraft(newRow({ brand: existing(10, "Four Roses"), label: existing(9, "Small Batch") }), BOTTLES, T)).toEqual(["/bottles/add?expression=9&prefill=tok"]);
    expect(expandStepsForDraft(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch") }), BOTTLES, T)).toBeNull();
    expect(expandStepsForDraft(newRow(), BOTTLES, T)).toBeNull();
  });
  it("is the one page that saves a new label and its bottle together when both are on", () => {
    expect(expandStepsForDraft(newRow({ brand: existing(10, "Four Roses"), label: fresh("Zed Batch") }), BOTH, T)).toEqual(["/bottles/add?prefill=tok"]);
    expect(expandStepsForDraft(newRow({ brand: existing(10, "Four Roses"), label: existing(9, "Small Batch") }), BOTH, T)).toEqual(["/bottles/add?expression=9&prefill=tok"]);
  });
  it("keeps the token safe in a url", () => {
    expect(expandStepsForDraft(newRow(), BOTH, "a b&c")).toEqual(["/bottles/add?prefill=a%20b%26c"]);
  });
});
