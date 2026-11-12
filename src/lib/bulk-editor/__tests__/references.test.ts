import { describe, expect, it } from "vitest";
import { editorFor, EDITORS } from "../editors";
import { decodeRef, encodePick, encodeRef, refCandidates, refNames, refServerFields, type RefData } from "../references";
import { applyEdits } from "../changes";
import { bottlePatchBody, createBody } from "../save";
import { SHEET_COLUMNS, type SheetBottle, type SheetColumn, type SheetLabel, type SheetRow } from "../sheet";

const data: RefData = {
  stores: [{ id: 3, name: "Total Wine", hint: "Austin, TX" }, { id: 4, name: "K&L" }],
  cooperages: [{ id: 9, name: "Independent Stave" }],
  releases: { 1: [{ id: 21, name: "2024 Release" }], 2: [{ id: 22, name: "Other" }] },
  versions: { 1: [{ id: 31, name: "Old Name" }] },
};
const label = { id: 1, brand: "Four Roses", name: "Single Barrel", fieldGroup: "whiskey", categoryId: 5, proof: "100.0", sizeMl: 750, cooperageId: 9 } as unknown as SheetLabel;
const bottle = { id: 7, expressionId: 1, storeId: 3, releaseId: 21, expressionNameId: 31, storeName: "Total Wine" } as unknown as SheetBottle;
const row = (over: Partial<SheetRow> = {}): SheetRow => ({ key: "b7", label, bottle, ...over });
const col = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;
const both = { labels: true, bottles: true };
const kinds = { 5: "american" } as const;
const ctx = { currency: "USD", kinds, refs: refNames(data) };

describe("a pick, as the text an edited cell holds", () => {
  it("is id:N for one that exists, new:Name for one to make, and blank for none", () => {
    expect(encodeRef(12)).toBe("id:12");
    expect(encodeRef(null)).toBe("");
    expect(encodePick({ kind: "existing", id: 3, name: "x" })).toBe("id:3");
    expect(encodePick({ kind: "new", name: "Binny's" })).toBe("new:Binny's");
    expect(decodeRef("id:12")).toEqual({ id: 12 });
    expect(decodeRef("new:Binny's")).toEqual({ name: "Binny's" });
    for (const bad of ["", "id:", "id:x", "id:0", "new:", "Binny's"]) expect(decodeRef(bad)).toBeNull();
  });
  it("goes to the server as the id, or the form's name for it, or null to clear", () => {
    expect(refServerFields("storeId", "id:3")).toEqual({ storeId: 3 });
    expect(refServerFields("storeId", "new:Binny's")).toEqual({ storeName: "Binny's" });
    expect(refServerFields("cooperageId", "new:Hoot Owl")).toEqual({ cooperageName: "Hoot Owl" });
    expect(refServerFields("releaseId", "")).toEqual({ releaseId: null });
  });
});

describe("what each cell offers", () => {
  it("offers the account's stores and cooperages, with a place to tell stores apart", () => {
    expect(refCandidates("store", 1, data)).toEqual([{ id: 3, name: "Total Wine", hint: "Austin, TX" }, { id: 4, name: "K&L" }]);
    expect(refCandidates("cooperage", 1, data)).toEqual([{ id: 9, name: "Independent Stave" }]);
  });
  it("offers only this label's own releases and names", () => {
    expect(refCandidates("release", 1, data)).toEqual([{ id: 21, name: "2024 Release" }]);
    expect(refCandidates("release", 2, data)).toEqual([{ id: 22, name: "Other" }]);
    expect(refCandidates("version", 1, data)).toEqual([{ id: 31, name: "Old Name" }]);
    expect(refCandidates("version", 2, data)).toEqual([]);
  });
});

describe("the picking cells", () => {
  it("are editable on a bottle row (and not on a label-only row), keyed to the form's own fields", () => {
    for (const [id, field] of [["store", "storeId"], ["releaseId", "releaseId"], ["expressionNameId", "expressionNameId"]] as const) {
      expect(editorFor(col(id), both, row())).toMatchObject({ field, reference: expect.any(String), scope: "bottle" });
      expect(editorFor(col(id), { labels: true, bottles: false }, { key: "l1", label, bottle: null })).toBeNull();
    }
  });
  it("show the name, mark a new one, and show a dash for none", () => {
    expect(EDITORS.store!.display("id:4", ctx, row()).text).toBe("K&L");
    expect(EDITORS.store!.display("new:Binny's", ctx, row())).toMatchObject({ text: "Binny's", badge: "new" });
    expect(EDITORS.store!.display("", ctx, row()).text).toBe("—");
    expect(EDITORS.releaseId!.display("id:21", ctx, row()).text).toBe("2024 Release");
  });
  it("read the bottle's own choice, and a moved bottle has neither a release nor a label name", () => {
    expect(EDITORS.store!.initial(row())).toBe("id:3");
    expect(EDITORS.releaseId!.initial(row())).toBe("id:21");
    expect(EDITORS.expressionNameId!.initial(row())).toBe("id:31");
    expect(EDITORS.releaseId!.initial(row({ moved: true }))).toBe("");
    expect(EDITORS.expressionNameId!.initial(row({ moved: true }))).toBe("");
    expect(EDITORS.store!.initial(row({ moved: true }))).toBe("id:3");
  });
  it("name a cooperage on the label, only for the spirits that use one", () => {
    expect(EDITORS.cooperageId).toMatchObject({ field: "cooperageId", scope: "label", reference: "cooperage" });
    expect(EDITORS.cooperageId!.initial(row())).toBe("id:9");
    expect(EDITORS.cooperageId!.applies?.(row(), kinds)).toBe(true);
    expect(EDITORS.cooperageId!.applies?.(row({ label: { ...label, fieldGroup: "rum" } as unknown as SheetLabel }), { 5: "other" })).toBe(false);
  });
  it("go in a bottle's request as ids or names, and a pick is not written onto the row's own data", () => {
    expect(bottlePatchBody({ store: "new:Binny's", releaseId: "id:21", expressionNameId: "" }, undefined)).toEqual({ storeName: "Binny's", releaseId: 21, expressionNameId: null });
    expect(applyEdits([row()], { b7: { store: "id:4" } })[0]!.bottle).toBe(bottle);
  });
  it("go in a new row's request, the store under the bottle and the cooperage under the label's facts", () => {
    const draft = { key: "d1", brand: { kind: "existing", id: 1, name: "Four Roses" }, label: { kind: "new", name: "New" }, categoryId: 5 } as const;
    expect(createBody(draft, { store: "new:Binny's", cooperageId: "id:9" }, true)).toMatchObject({ bottle: { storeName: "Binny's" }, label: { facts: { cooperageId: 9 } } });
  });
});
