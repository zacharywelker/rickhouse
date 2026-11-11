import { describe, expect, it } from "vitest";
import { countEdits, EDITORS, editorFor, parseCell, setEdit, type CellEditor } from "../editors";
import { SHEET_COLUMNS, type SheetBottle, type SheetColumn, type SheetContext, type SheetLabel, type SheetRow } from "../sheet";

const label = { id: 1, brand: "Four Roses", name: "Single Barrel", proof: "100.0", sizeMl: 750, msrp: "49.99" } as unknown as SheetLabel;
const bottle = (over: Partial<SheetBottle> = {}): SheetBottle => ({
  id: 7, expressionId: 1, status: "owned", pricePaid: "47.00", storeName: null, dateAcquired: "2025-09-20", isSingleBarrel: false, isSingleBarrelPick: false,
  pickName: null, releaseYear: null, location: null, notes: null, sizeMl: null, proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ...over,
});
const bottleRow = (b = bottle()): SheetRow => ({ key: `b${b.id}`, label, bottle: b });
const labelRow: SheetRow = { key: "l1", label, bottle: null };
const col = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;
const ctx: SheetContext = { currency: "USD", kinds: {} };
const ed = (id: string): CellEditor => EDITORS[id]!;

describe("editorFor", () => {
  const both = { labels: true, bottles: true };
  const labelsOnly = { labels: true, bottles: false };

  it("lets a bottle's own plain cells be edited on a bottle row", () => {
    for (const id of ["pricePaid", "dateAcquired", "releaseYear", "location", "notes", "ownProof", "ownSize"]) {
      expect(editorFor(col(id), both, bottleRow())?.column).toBe(id);
    }
  });
  it("lets a pick name be edited only on a private selection, as the form does", () => {
    expect(editorFor(col("pickName"), both, bottleRow())).toBeNull();
    expect(editorFor(col("pickName"), both, bottleRow(bottle({ isSingleBarrelPick: true })))?.column).toBe("pickName");
  });
  it("leaves a label's facts read-only on a bottle row, where they belong to every bottle on the label", () => {
    for (const id of ["proof", "sizeMl", "msrp"]) expect(editorFor(col(id), both, bottleRow())).toBeNull();
  });
  it("lets a label's plain facts be edited where the row is the label", () => {
    for (const id of ["proof", "sizeMl", "msrp"]) expect(editorFor(col(id), labelsOnly, labelRow)?.scope).toBe("label");
  });
  it("has no editor for the cells that need an autocomplete, a lock or several fields", () => {
    for (const id of ["brand", "name", "category", "store", "distilleries", "mashbills", "finishes", "age", "designation", "singleBarrel", "status"]) {
      expect(editorFor(col(id), both, bottleRow())).toBeNull();
      expect(editorFor(col(id), labelsOnly, labelRow)).toBeNull();
    }
  });
  it("is keyed to the form's own field definitions", () => {
    expect(ed("pricePaid").spec).toMatchObject({ kind: "number", name: "pricePaid", money: true });
    expect(ed("dateAcquired").spec).toMatchObject({ kind: "date" });
    expect(ed("ownProof").field).toBe("proof");
    expect(ed("ownSize").field).toBe("sizeMl");
  });
});

describe("initial and display", () => {
  it("reads a cell as the text an input holds", () => {
    expect(ed("pricePaid").initial(bottleRow())).toBe("47.00");
    expect(ed("ownProof").initial(bottleRow())).toBe("");
    expect(ed("ownProof").initial(bottleRow(bottle({ proof: "104.20" })))).toBe("104.2");
    expect(ed("ownSize").initial(bottleRow(bottle({ sizeMl: 375 })))).toBe("375");
    expect(ed("proof").initial(labelRow)).toBe("100");
    expect(ed("sizeMl").initial(labelRow)).toBe("750");
  });
  it("shows an edited value back the way the sheet shows it", () => {
    expect(ed("pricePaid").display("52.5", ctx, bottleRow())).toEqual({ text: "$52.50" });
    expect(ed("dateAcquired").display("2025-10-01", ctx, bottleRow())).toEqual({ text: "Oct 1, 2025" });
    expect(ed("msrp").display("", ctx, labelRow)).toEqual({ text: "—", muted: true });
  });
  it("shows the label's value in grey when a bottle's own proof or size is cleared", () => {
    expect(ed("ownProof").display("", ctx, bottleRow())).toEqual({ text: "100", muted: true });
    expect(ed("ownProof").display("104.2", ctx, bottleRow())).toEqual({ text: "104.2" });
    expect(ed("ownSize").display("", ctx, bottleRow())).toEqual({ text: "750 mL", muted: true });
  });
});

describe("parseCell", () => {
  it("keeps a blank as blank, which clears the value", () => {
    expect(parseCell(ed("pricePaid"), "  ")).toEqual({ ok: true, value: "" });
  });
  it("refuses a blank where a value is required (a label's size)", () => {
    expect(parseCell(ed("sizeMl"), "")).toMatchObject({ ok: false });
  });
  it("checks numbers against the field's own range, whole numbers and money decimals", () => {
    expect(parseCell(ed("ownProof"), "104.2")).toEqual({ ok: true, value: "104.2" });
    expect(parseCell(ed("ownProof"), "abc")).toMatchObject({ ok: false, message: "Enter a number." });
    expect(parseCell(ed("ownProof"), "250")).toMatchObject({ ok: false, message: "At most 200." });
    expect(parseCell(ed("ownProof"), "-1")).toMatchObject({ ok: false });
    expect(parseCell(ed("ownSize"), "375.5")).toMatchObject({ ok: false, message: "Use a whole number." });
    expect(parseCell(ed("releaseYear"), "1650")).toMatchObject({ ok: false });
    expect(parseCell(ed("pricePaid"), "47.5")).toEqual({ ok: true, value: "47.5" });
    expect(parseCell(ed("pricePaid"), "47.555")).toMatchObject({ ok: false, message: "Use at most two decimals." });
  });
  it("reads freehand decimals: .5 is 0.5 and 5. is 5, and a stray second point is not a number", () => {
    expect(parseCell(ed("ownProof"), ".75")).toEqual({ ok: true, value: "0.75" });
    expect(parseCell(ed("ownProof"), "104.")).toEqual({ ok: true, value: "104" });
    expect(parseCell(ed("pricePaid"), ".5")).toEqual({ ok: true, value: "0.5" });
    expect(parseCell(ed("pricePaid"), "-.5")).toMatchObject({ ok: false, message: "At least 0." });
    expect(parseCell(ed("ownProof"), "1.2.3")).toMatchObject({ ok: false, message: "Enter a number." });
    expect(parseCell(ed("ownProof"), "-")).toMatchObject({ ok: false });
  });
  it("checks dates, and that a purchase date has already happened", () => {
    expect(parseCell(ed("dateAcquired"), "2025-09-20", "2026-01-01")).toEqual({ ok: true, value: "2025-09-20" });
    expect(parseCell(ed("dateAcquired"), "2026-02-01", "2026-01-01")).toMatchObject({ ok: false, message: "That date is in the future." });
    expect(parseCell(ed("dateAcquired"), "20-9-2025")).toMatchObject({ ok: false, message: "Use a date." });
    expect(parseCell(ed("dateAcquired"), "2025-13-45")).toMatchObject({ ok: false });
  });
  it("takes any text for a text field", () => {
    expect(parseCell(ed("notes"), "  Gift from Sam ")).toEqual({ ok: true, value: "Gift from Sam" });
  });
});

describe("edits", () => {
  it("records a changed value and forgets one that is back to what it was", () => {
    let edits = setEdit({}, "b7", "pricePaid", "52", "47.00");
    expect(edits).toEqual({ b7: { pricePaid: "52" } });
    expect(countEdits(edits)).toBe(1);
    edits = setEdit(edits, "b7", "notes", "x", "");
    expect(countEdits(edits)).toBe(2);
    edits = setEdit(edits, "b7", "pricePaid", "47.00", "47.00");
    expect(edits).toEqual({ b7: { notes: "x" } });
    edits = setEdit(edits, "b7", "notes", "", "");
    expect(edits).toEqual({});
    expect(countEdits(edits)).toBe(0);
  });
  it("returns the same object when nothing changes, so nothing re-renders", () => {
    const edits = setEdit({}, "b7", "pricePaid", "52", "47.00");
    expect(setEdit(edits, "b7", "pricePaid", "52", "47.00")).toBe(edits);
    expect(setEdit(edits, "b9", "pricePaid", "1", "1")).toBe(edits);
  });
});
