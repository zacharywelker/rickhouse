import { describe, expect, it } from "vitest";
import { applyEdits } from "../changes";
import { EDITORS, editorFor, isLocked, parseCell, unlockKey } from "../editors";
import { cellFromText, GENERATED, GENERATED_BOTTLE, GENERATED_LABEL, isYesNoChoice, textOf, type Kinds } from "../fields";
import { serverFields } from "../save";
import { SHEET_COLUMNS, type SheetBottle, type SheetColumn, type SheetContext, type SheetLabel, type SheetRow, type SheetView } from "../sheet";

const kinds: Kinds = { 20: "american", 30: "other", 40: "gin" };
const ctx: SheetContext = { currency: "USD", kinds };
const both: SheetView = { labels: true, bottles: true };
const labelsOnly: SheetView = { labels: true, bottles: false };
const col = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;

const label = (over: Record<string, unknown> = {}) =>
  ({ id: 1, brandId: 1, brand: "Four Roses", name: "Single Barrel", categoryId: 20, category: "Bourbon", fieldGroup: "whiskey", proof: "100", sizeMl: 750, msrp: null, isCaskStrength: false, isBottledInBond: false, isAgedGin: false, tequilaClass: null, peatStatus: null, esterGl: null, links: { distilleries: [], mashbills: [], finishes: [] }, ...over }) as unknown as SheetLabel;
const bottle = (over: Partial<SheetBottle> = {}) => ({ id: 7, expressionId: 1, isSingleBarrel: false, isSingleBarrelPick: false, batch: null, acquisition: "purchase", tequilaClass: null, ...over }) as unknown as SheetBottle;
const bottleRow = (l = label(), b = bottle()): SheetRow => ({ key: `b${b.id}`, label: l, bottle: b });
const labelRow = (l = label()): SheetRow => ({ key: `l${l.id}`, label: l, bottle: null });

describe("the generated columns", () => {
  it("are one for each simple form field, with unique ids across the whole sheet", () => {
    const ids = SHEET_COLUMNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(GENERATED_LABEL.length).toBeGreaterThan(30);
    expect(GENERATED_BOTTLE.length).toBeGreaterThan(8);
  });
  it("are hidden until switched on, and each has an editor under its own id", () => {
    for (const g of GENERATED) {
      expect(g.column.defaultHidden).toBe(true);
      expect(EDITORS[g.column.id]).toBe(g.editor);
      expect(g.column.section).toBeTruthy();
    }
  });
  it("keep the label's columns before the bottle's, which the sheet's two captions rely on", () => {
    const groups = SHEET_COLUMNS.map((c) => c.group);
    expect(groups.indexOf("bottle")).toBe(groups.filter((g) => g === "label").length);
    expect(groups.lastIndexOf("label")).toBe(groups.indexOf("bottle") - 1);
  });
  it("give a bottle's own value of a field a label has too its own id, so neither hides the other", () => {
    expect(EDITORS.ownBarrelFilledOn!.field).toBe("barrelFilledOn");
    expect(EDITORS.ownBarrelFilledOn!.scope).toBe("bottle");
    expect(EDITORS.barrelFilledOn!.scope).toBe("label");
    expect(EDITORS.releaseBottleCount!.field).toBe("bottleCount");
  });
  it("keep a field that two sections have as two columns that set the same field", () => {
    expect(EDITORS.isAdditiveFree!.field).toBe("isAdditiveFree");
    expect(EDITORS.agaveAdditiveFree!.field).toBe("isAdditiveFree");
    expect(EDITORS["liqueur-originCountry"]!.field).toBe("originCountry");
  });
});

describe("which spirits a label fact applies to", () => {
  it("peat is a whiskey's; esters are a rum's: a cell for another spirit is not editable and says so", () => {
    const whiskey = labelRow();
    const rum = labelRow(label({ categoryId: 30, fieldGroup: "rum" }));
    expect(editorFor(col("peatStatus"), labelsOnly, whiskey, new Set(), kinds)?.field).toBe("peatStatus");
    expect(editorFor(col("peatStatus"), labelsOnly, rum, new Set(), kinds)).toBeNull();
    expect(col("peatStatus").cell(rum, ctx)).toMatchObject({ text: "—", note: "Not used for this spirit" });
    expect(editorFor(col("esterGl"), labelsOnly, rum, new Set(), kinds)?.field).toBe("esterGl");
    expect(editorFor(col("esterGl"), labelsOnly, whiskey, new Set(), kinds)).toBeNull();
  });
  it("tequila class is for tequila, not other agave or a bourbon", () => {
    expect(editorFor(col("tequilaClass"), labelsOnly, labelRow(), new Set(), kinds)).toBeNull();
  });
  it("on a bottle row, a label fact is locked until unlocked, and a fact that does not apply has no lock", () => {
    const row = bottleRow();
    expect(isLocked(col("peatStatus"), both, row, new Set(), kinds)).toBe(true);
    expect(editorFor(col("peatStatus"), both, row, new Set([unlockKey(1, "peatStatus")]), kinds)?.field).toBe("peatStatus");
    const rum = bottleRow(label({ id: 2, categoryId: 30, fieldGroup: "rum" }), bottle({ expressionId: 2 }));
    expect(isLocked(col("peatStatus"), both, rum, new Set(), kinds)).toBe(false);
  });
});

describe("which spirits and kinds of bottle a bottle fact applies to", () => {
  it("batch is any bottle's", () => {
    expect(editorFor(col("batch"), both, bottleRow(), new Set(), kinds)?.field).toBe("batch");
    expect(editorFor(col("batch"), labelsOnly, labelRow(), new Set(), kinds)).toBeNull(); // a label has no bottle
  });
  it("the barrel's details are for a single barrel or a private pick only, as the form shows them", () => {
    expect(editorFor(col("barrelNumber"), both, bottleRow(), new Set(), kinds)).toBeNull();
    expect(col("barrelNumber").cell(bottleRow(), ctx).note).toBe("Only for a single barrel or a private pick");
    expect(editorFor(col("barrelNumber"), both, bottleRow(label(), bottle({ isSingleBarrel: true })), new Set(), kinds)?.field).toBe("barrelNumber");
  });
  it("who picked it is a private pick's alone", () => {
    expect(editorFor(col("pickedBy"), both, bottleRow(label(), bottle({ isSingleBarrel: true })), new Set(), kinds)).toBeNull();
    expect(editorFor(col("pickedBy"), both, bottleRow(label(), bottle({ isSingleBarrelPick: true })), new Set(), kinds)?.field).toBe("pickedBy");
  });
  it("a gin that is not aged has no barrel at all", () => {
    const gin = label({ id: 4, categoryId: 40, fieldGroup: "gin", isAgedGin: false });
    expect(editorFor(col("singleBarrel"), both, bottleRow(gin, bottle({ expressionId: 4 })), new Set(), kinds)).toBeNull();
    expect(editorFor(col("singleBarrel"), both, bottleRow(), new Set(), kinds)?.field).toBe("singleBarrel");
  });
  it("a bottle that has just been made a private pick opens its pick details at once, before it has saved", () => {
    const row = bottleRow();
    expect(editorFor(col("pickedBy"), both, row, new Set(), kinds)).toBeNull();
    const [typed] = applyEdits([row], { b7: { singleBarrel: "pick" } });
    expect(editorFor(col("pickedBy"), both, typed!, new Set(), kinds)?.field).toBe("pickedBy");
  });
});

describe("the Cask / Bonded cell", () => {
  const ed = EDITORS.designation!;
  it("is one choice for the two flags, and reads them back", () => {
    expect(ed.initial(bottleRow())).toBe("");
    expect(ed.initial(bottleRow(label({ isCaskStrength: true })))).toBe("cask");
    expect(ed.initial(bottleRow(label({ isBottledInBond: true })))).toBe("bib");
    expect(ed.initial(bottleRow(label({ isCaskStrength: true, isBottledInBond: true })))).toBe("both");
    expect(ed.fieldsOf!("cask")).toEqual({ isCaskStrength: true, isBottledInBond: false });
    expect(ed.fieldsOf!("both")).toEqual({ isCaskStrength: true, isBottledInBond: true });
    expect(ed.fieldsOf!("")).toEqual({ isCaskStrength: false, isBottledInBond: false });
  });
  it("shows the choice as the Cask / BiB column always has", () => {
    expect(col("designation").cell(bottleRow(label({ isCaskStrength: true, isBottledInBond: true })), ctx)).toEqual({ text: "Cask Strength · Bottled in Bond" });
    expect(col("designation").cell(bottleRow(), ctx)).toEqual({ text: "—", muted: true });
  });
  it("is a label's: locked on a bottle row, editable where the row is the label", () => {
    expect(isLocked(col("designation"), both, bottleRow(), new Set(), kinds)).toBe(true);
    expect(editorFor(col("designation"), labelsOnly, labelRow(), new Set(), kinds)?.field).toBe("designation");
  });
  it("refuses a choice the spirit cannot have", () => {
    const row = labelRow(label({ categoryId: 40, fieldGroup: "gin" }));
    const result = parseCell(ed, "bib", undefined, row, kinds);
    // Whether gin has a Bottled in Bond flag is the form's rule; whatever it says, the check agrees with the editor.
    expect(result.ok).toBe(ed.check!("bib", row, kinds) === null);
  });
});

describe("what a cell's text is, to the server", () => {
  it("is a boolean for a checkbox, and for a yes/no choice \"true\", \"false\" or \"\" as the form sends them", () => {
    expect(serverFields(EDITORS.isStraight, "isStraight", "true")).toEqual({ isStraight: true });
    expect(serverFields(EDITORS.isStraight, "isStraight", "false")).toEqual({ isStraight: false });
    const yesNo = GENERATED_LABEL.find((g) => isYesNoChoice(g.editor.spec))!;
    expect(serverFields(yesNo.editor, yesNo.column.id, "true")).toEqual({ [yesNo.editor.field]: "true" });
    expect(serverFields(yesNo.editor, yesNo.column.id, "")).toEqual({ [yesNo.editor.field]: "" });
  });
  it("is the option for a choice, the text for text, and nothing for a blank", () => {
    expect(serverFields(EDITORS.acquisition, "acquisition", "gift")).toEqual({ acquisition: "gift" });
    expect(serverFields(EDITORS.upc, "upc", "")).toEqual({ upc: null });
    expect(serverFields(EDITORS.batch, "batch", "B524")).toEqual({ batch: "B524" });
  });
  it("is both flags for the two composite cells", () => {
    expect(serverFields(EDITORS.designation, "designation", "bib")).toEqual({ isCaskStrength: false, isBottledInBond: true });
    expect(serverFields(EDITORS.singleBarrel, "singleBarrel", "pick")).toEqual({ isSingleBarrel: true, isSingleBarrelPick: true });
    expect(serverFields(EDITORS.singleBarrel, "singleBarrel", "single")).toEqual({ isSingleBarrel: true, isSingleBarrelPick: false });
    expect(serverFields(EDITORS.singleBarrel, "singleBarrel", "")).toEqual({ isSingleBarrel: false, isSingleBarrelPick: false });
  });
});

describe("reading and showing a value", () => {
  it("reads a checkbox as true or false, a choice as its option, and a blank as empty", () => {
    expect(textOf(EDITORS.isStraight!.spec, { isStraight: true })).toBe("true");
    expect(textOf(EDITORS.isStraight!.spec, { isStraight: null })).toBe("false");
    expect(textOf(EDITORS.acquisition!.spec, { acquisition: "gift" })).toBe("gift");
    expect(textOf(EDITORS.upc!.spec, { upc: null })).toBe("");
  });
  it("shows a checkbox as Yes or a dash, a choice by its label, a date in words", () => {
    expect(cellFromText(EDITORS.isStraight!.spec, "true")).toEqual({ text: "Yes" });
    expect(cellFromText(EDITORS.isStraight!.spec, "false")).toEqual({ text: "—", muted: true });
    expect(cellFromText(EDITORS.acquisition!.spec, "gift").text).not.toBe("gift");
    expect(cellFromText(EDITORS.ownBottledOn!.spec, "2025-09-20")).toEqual({ text: "Sep 20, 2025" });
  });
  it("refuses a choice that is not one of the options, and a yes/no that is neither", () => {
    expect(parseCell(EDITORS.acquisition!, "teleported")).toEqual({ ok: false, message: "Choose one of the options." });
    expect(parseCell(EDITORS.isStraight!, "maybe")).toEqual({ ok: false, message: "Choose yes or no." });
    expect(parseCell(EDITORS.isStraight!, "true")).toEqual({ ok: true, value: "true" });
  });
  it("does not let a choice with no empty option be cleared", () => {
    expect(parseCell(EDITORS.acquisition!, "")).toMatchObject({ ok: false });
  });
});
