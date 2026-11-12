import { describe, expect, it } from "vitest";
import { countEdits, EDITORS, editorFor, isLocked, parseCell, setEdit, unlockKey, type CellEditor } from "../editors";
import { SHEET_COLUMNS, type SheetBottle, type SheetColumn, type SheetContext, type SheetLabel, type SheetRow } from "../sheet";

const label = { id: 1, brand: "Four Roses", name: "Single Barrel", proof: "100.0", sizeMl: 750, msrp: "49.99" } as unknown as SheetLabel;
const bottle = (over: Partial<SheetBottle> = {}): SheetBottle => ({
  id: 7, expressionId: 1, status: "owned", pricePaid: "47.00", storeName: null, storeId: null, releaseId: null, expressionNameId: null, dateAcquired: "2025-09-20", isSingleBarrel: false, isSingleBarrelPick: false,
  pickName: null, releaseYear: null, location: null, notes: null, sizeMl: null, proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", acquisition: "purchase", batch: null, pickedBy: null, barrelNumber: null, bottleCount: null, warehouse: null, rickFloor: null, barrelFilledOn: null, bottledOn: null, ginIsNas: null, tequilaClass: null, brandyGrade: null, fillPct: 100, isOpen: false, dateOpened: null, dateKilled: null, isFavorite: false, ...over,
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
  it("locks a label's facts on a bottle row where both are shown, until the cell is unlocked", () => {
    for (const id of ["proof", "sizeMl", "msrp"]) {
      expect(editorFor(col(id), both, bottleRow())).toBeNull();
      expect(isLocked(col(id), both, bottleRow())).toBe(true);
      const open = new Set([unlockKey(1, id)]);
      expect(editorFor(col(id), both, bottleRow(), open)?.scope).toBe("label");
      expect(isLocked(col(id), both, bottleRow(), open)).toBe(false);
    }
  });
  it("unlocks one label's cell and column only", () => {
    const open = new Set([unlockKey(1, "proof")]);
    expect(editorFor(col("msrp"), both, bottleRow(), open)).toBeNull();
    const other = { ...bottleRow(), label: { ...label, id: 2 } as SheetLabel };
    expect(editorFor(col("proof"), both, other, open)).toBeNull();
  });
  it("lets a Bottles-only view change no label fact, and offers no unlock", () => {
    const bottlesOnly = { labels: false, bottles: true };
    const open = new Set([unlockKey(1, "proof")]);
    for (const id of ["proof", "sizeMl", "msrp"]) {
      expect(isLocked(col(id), bottlesOnly, bottleRow())).toBe(false);
      expect(editorFor(col(id), bottlesOnly, bottleRow(), open)).toBeNull();
    }
  });
  it("lets a label's plain facts be edited where the row is the label, with no lock", () => {
    for (const id of ["proof", "sizeMl", "msrp"]) {
      expect(editorFor(col(id), labelsOnly, labelRow)?.scope).toBe("label");
      expect(isLocked(col(id), labelsOnly, labelRow)).toBe(false);
    }
  });
  it("moves a saved bottle with Brand or Label, and in the Labels view renames: Brand picks, Label is typed", () => {
    for (const [id, combo] of [["brand", "brand"], ["name", "label"]] as const) {
      expect(editorFor(col(id), both, bottleRow())?.combo).toBe(combo);
      expect(editorFor(col(id), { labels: false, bottles: true }, bottleRow())?.combo).toBe(combo);
    }
    expect(editorFor(col("brand"), labelsOnly, labelRow)?.combo).toBe("brand");
    const rename = editorFor(col("name"), labelsOnly, labelRow);
    expect(rename?.combo).toBeUndefined();
    expect(rename).toMatchObject({ field: "name", scope: "label", required: true });
  });
  it("has no editor yet for the cells that need a picker, a list, or a bottle's life of their own (the next parity steps)", () => {
    for (const id of ["category", "distilleries", "mashbills", "finishes"]) {
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

describe("editorFor on a new row", () => {
  const both = { labels: true, bottles: true };
  const labelsOnly = { labels: true, bottles: false };
  const draftRow = (meta: Partial<NonNullable<SheetRow["draft"]>>, withBottle = true): SheetRow => ({
    key: "d0", label, bottle: withBottle ? bottle({ id: -1 }) : null,
    draft: { brandChosen: false, labelChosen: false, brandIsNew: false, labelIsNew: false, ...meta },
  });

  it("always offers Brand, and Label only once a brand is chosen", () => {
    expect(editorFor(col("brand"), both, draftRow({}))?.combo).toBe("brand");
    expect(editorFor(col("name"), both, draftRow({}))).toBeNull();
    expect(editorFor(col("name"), both, draftRow({ brandChosen: true }))?.combo).toBe("label");
  });
  it("offers Category only for a new label, never for one that exists", () => {
    expect(editorFor(col("category"), both, draftRow({ brandChosen: true }))).toBeNull();
    expect(editorFor(col("category"), both, draftRow({ brandChosen: true, labelChosen: true, labelIsNew: true }))?.combo).toBe("category");
    expect(editorFor(col("category"), both, draftRow({ brandChosen: true, labelChosen: true, labelIsNew: false }))).toBeNull();
  });
  it("does not offer Category on a row that is already saved: its label has one", () => {
    expect(editorFor(col("category"), both, bottleRow())).toBeNull();
    expect(editorFor(col("category"), labelsOnly, labelRow)).toBeNull();
  });
  it("lets a new label's facts be typed, but not those of a label that exists", () => {
    const fresh = draftRow({ brandChosen: true, labelChosen: true, labelIsNew: true });
    const existing = draftRow({ brandChosen: true, labelChosen: true, labelIsNew: false });
    for (const id of ["proof", "sizeMl", "msrp"]) {
      expect(editorFor(col(id), both, fresh)?.scope).toBe("label");
      expect(editorFor(col(id), both, existing)).toBeNull();
      expect(editorFor(col(id), labelsOnly, existing)).toBeNull();
    }
  });
  it("does not offer a label's facts before a label is chosen on a bottle row", () => {
    expect(editorFor(col("proof"), both, draftRow({ brandChosen: true }))).toBeNull();
  });
  it("lets the bottle's own cells be typed on a new bottle row", () => {
    expect(editorFor(col("pricePaid"), both, draftRow({}))?.column).toBe("pricePaid");
    expect(editorFor(col("pricePaid"), labelsOnly, draftRow({}, false))).toBeNull();
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
