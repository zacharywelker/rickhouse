import { describe, expect, it } from "vitest";
import { columnsFor, DEFAULT_HIDDEN, normaliseView, SHEET_COLUMNS, sheetRows, type SheetBottle, type SheetColumn, type SheetContext, type SheetLabel } from "../sheet";

const label = (over: Partial<SheetLabel> & Pick<SheetLabel, "id" | "brand" | "name">): SheetLabel =>
  ({
    category: "Bourbon", categoryId: 1, fieldGroup: "whiskey", proof: "100.0", sizeMl: 750, msrp: null,
    isCaskStrength: false, isBottledInBond: false, isStraight: false, isNas: false, isAged: false,
    ageStatement: null, ageYears: null, ageMonths: null, ageDays: null, bottleCount: 0,
    links: { distilleries: [], mashbills: [], finishes: [] },
    ...over,
  }) as unknown as SheetLabel;

const bottle = (over: Partial<SheetBottle> & Pick<SheetBottle, "id" | "expressionId">): SheetBottle => ({
  status: "owned", pricePaid: null, storeName: null, dateAcquired: null, isSingleBarrel: false, isSingleBarrelPick: false,
  pickName: null, releaseYear: null, location: null, notes: null, sizeMl: null, proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null,
  acquisition: "purchase", batch: null, pickedBy: null, barrelNumber: null, bottleCount: null, warehouse: null, rickFloor: null, barrelFilledOn: null, bottledOn: null, ginIsNas: null, tequilaClass: null, brandyGrade: null,
  ...over,
});

const ctx: SheetContext = { currency: "USD", kinds: { 1: "american" } };
const column = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;
const cell = (id: string, row: { label: SheetLabel; bottle: SheetBottle | null }) => column(id).cell({ key: "k", ...row }, ctx);

describe("normaliseView", () => {
  it("keeps one view on, and turns both on if neither is asked for", () => {
    expect(normaliseView({ labels: false, bottles: true })).toEqual({ labels: false, bottles: true });
    expect(normaliseView({ labels: true, bottles: false })).toEqual({ labels: true, bottles: false });
    expect(normaliseView({ labels: false, bottles: false })).toEqual({ labels: true, bottles: true });
    expect(normaliseView(null)).toEqual({ labels: true, bottles: true });
  });
});

describe("columnsFor", () => {
  const ids = (view: { labels: boolean; bottles: boolean }, hidden: ReadonlySet<string> = new Set()) => columnsFor(view, hidden).map((c) => c.id);

  it("always shows Brand and Label, even when they are hidden", () => {
    expect(ids({ labels: true, bottles: true }, new Set(["brand", "name"])).slice(0, 2)).toEqual(["brand", "name"]);
  });

  it("follows the shelf order, label facts then the bottle's own", () => {
    expect(ids({ labels: true, bottles: true }, DEFAULT_HIDDEN)).toEqual([
      "brand", "name", "category", "sizeMl", "proof", "designation", "age", "distilleries", "mashbills", "finishes", "msrp",
      "singleBarrel", "pricePaid", "store", "dateAcquired", "status",
    ]);
  });

  it("hides the bottle's own proof, age and size until they are switched on", () => {
    expect(ids({ labels: true, bottles: true }, DEFAULT_HIDDEN)).not.toContain("ownProof");
    expect(ids({ labels: true, bottles: true })).toEqual(expect.arrayContaining(["ownProof", "ownAge", "ownSize"]));
  });

  it("with Bottles off, shows the label's columns and a count of bottles", () => {
    const labelsOnly = ids({ labels: true, bottles: false }, DEFAULT_HIDDEN);
    expect(labelsOnly).toContain("bottleCount");
    expect(labelsOnly).toContain("msrp");
    expect(labelsOnly).not.toContain("pricePaid");
  });

  it("with Labels off, shows Brand, Label and the bottle's columns only", () => {
    const bottlesOnly = ids({ labels: false, bottles: true }, DEFAULT_HIDDEN);
    expect(bottlesOnly).toEqual(["brand", "name", "singleBarrel", "pricePaid", "store", "dateAcquired", "status"]);
  });

  it("keeps a column the person hid hidden", () => {
    expect(ids({ labels: true, bottles: true }, new Set(["finishes"]))).not.toContain("finishes");
  });
});

describe("sheetRows", () => {
  const labels = [label({ id: 2, brand: "Weller", name: "12 Antique" }), label({ id: 1, brand: "Four Roses", name: "Single Barrel" }), label({ id: 3, brand: "four roses", name: "Small Batch" })];
  const bottles = [bottle({ id: 10, expressionId: 2 }), bottle({ id: 11, expressionId: 1 }), bottle({ id: 12, expressionId: 2 }), bottle({ id: 13, expressionId: 99 })];

  it("is one row per bottle with Bottles on, ordered by brand and label so a label's bottles sit together", () => {
    const rows = sheetRows({ labels: true, bottles: true }, labels, bottles);
    expect(rows.map((r) => r.key)).toEqual(["b11", "b10", "b12"]);
    expect(rows.map((r) => r.label.name)).toEqual(["Single Barrel", "12 Antique", "12 Antique"]);
  });

  it("leaves out a bottle whose label is not in the set", () => {
    expect(sheetRows({ labels: true, bottles: true }, labels, bottles).some((r) => r.bottle?.id === 13)).toBe(false);
  });

  it("is one row per label with Bottles off, case-insensitively by brand then name", () => {
    const rows = sheetRows({ labels: true, bottles: false }, labels, bottles);
    expect(rows.map((r) => r.key)).toEqual(["l1", "l3", "l2"]);
    expect(rows.every((r) => r.bottle === null)).toBe(true);
  });
});

describe("cells", () => {
  const l = label({ id: 1, brand: "Four Roses", name: "Single Barrel", proof: "100.0", sizeMl: 750, msrp: "49.99", isCaskStrength: true, isBottledInBond: true });

  it("shows a label's own facts", () => {
    expect(cell("proof", { label: l, bottle: null })).toEqual({ text: "100" });
    expect(cell("sizeMl", { label: l, bottle: null })).toEqual({ text: "750 mL" });
    expect(cell("designation", { label: l, bottle: null })).toEqual({ text: "Cask Strength · Bottled in Bond" });
    expect(cell("msrp", { label: l, bottle: null })).toEqual({ text: "$49.99" });
  });

  it("shows a dash where there is no value", () => {
    const bare = label({ id: 2, brand: "B", name: "N", proof: null });
    expect(cell("proof", { label: bare, bottle: null })).toEqual({ text: "—", muted: true });
    expect(cell("designation", { label: bare, bottle: null })).toEqual({ text: "—", muted: true });
    expect(cell("msrp", { label: bare, bottle: null })).toEqual({ text: "—", muted: true });
  });

  it("shows a bottle's own value, and the label's in grey when the bottle has none of its own", () => {
    expect(cell("ownProof", { label: l, bottle: bottle({ id: 1, expressionId: 1 }) })).toEqual({ text: "100", muted: true });
    expect(cell("ownProof", { label: l, bottle: bottle({ id: 1, expressionId: 1, proof: "104.2" }) })).toEqual({ text: "104.2" });
    expect(cell("ownSize", { label: l, bottle: bottle({ id: 1, expressionId: 1, sizeMl: 375 }) })).toEqual({ text: "375 mL" });
    expect(cell("ownSize", { label: l, bottle: bottle({ id: 1, expressionId: 1 }) })).toEqual({ text: "750 mL", muted: true });
  });

  it("shows a bottle's price, store, date and single-barrel facts", () => {
    const b = bottle({ id: 1, expressionId: 1, pricePaid: "47.00", storeName: "Binny's", dateAcquired: "2025-09-20", isSingleBarrel: true, isSingleBarrelPick: true });
    expect(cell("pricePaid", { label: l, bottle: b })).toEqual({ text: "$47.00" });
    expect(cell("store", { label: l, bottle: b })).toEqual({ text: "Binny's" });
    expect(cell("dateAcquired", { label: l, bottle: b })).toEqual({ text: "Sep 20, 2025" });
    expect(cell("singleBarrel", { label: l, bottle: b })).toEqual({ text: "Private pick" }); // a private pick is a single barrel, so it says the one
  });

  it("shows no mashbill for a spirit that has none", () => {
    const rum = label({ id: 3, brand: "R", name: "Rum", fieldGroup: "rum" });
    expect(cell("mashbills", { label: rum, bottle: null })).toEqual({ text: "—", muted: true });
  });

  it("reads a label's age from its statement or parts, and nothing for vodka", () => {
    expect(cell("age", { label: label({ id: 4, brand: "B", name: "Gin", fieldGroup: "gin", ageYears: "12.0" }), bottle: null })).toEqual({ text: "12y" });
    expect(cell("age", { label: label({ id: 5, brand: "B", name: "Vodka", fieldGroup: "vodka" }), bottle: null })).toEqual({ text: "—", muted: true });
  });
});
