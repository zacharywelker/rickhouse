import { describe, expect, it } from "vitest";
import { railFor } from "../rail";
import type { SheetBottle, SheetContext, SheetLabel, SheetRow, SheetView } from "../sheet";

const ctx: SheetContext = { currency: "USD", kinds: {} };
const both: SheetView = { labels: true, bottles: true };
const labelsOnly: SheetView = { labels: true, bottles: false };

const label = (over: Record<string, unknown> = {}) =>
  ({
    id: 1, brand: "Four Roses", name: "Single Barrel", category: "Bourbon", categoryId: 20, fieldGroup: "whiskey", proof: "100.0", sizeMl: 750, msrp: "49.99",
    ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, isCaskStrength: false, isBottledInBond: false, isStraight: false, isNas: false, isAged: false,
    bottleCount: 3, links: { distilleries: [{ id: 1, label: "Four Roses Distillery", amount: "" }], mashbills: [], finishes: [], ingredients: [] }, ...over,
  }) as unknown as SheetLabel;
const bottle = (over: Partial<SheetBottle> = {}) =>
  ({ id: 7, expressionId: 1, status: "owned", pricePaid: "47.00", storeName: "Binny's", dateAcquired: "2025-09-20", isSingleBarrel: false, isSingleBarrelPick: false, pickName: null, releaseYear: null, location: null, notes: null, sizeMl: null, proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ...over }) as SheetBottle;
const row = (b: SheetBottle | null = bottle(), l = label()): SheetRow => ({ key: b ? `b${b.id}` : `l${l.id}`, label: l, bottle: b });
const byLabel = (rail: ReturnType<typeof railFor>, name: string) => rail.facts.find((f) => f.label === name);

describe("the rail for a bottle", () => {
  const rail = railFor(row(), ctx, both, {}, null);
  it("names the bottle, with its brand, label and category", () => {
    expect(rail).toMatchObject({ kind: "bottle", brand: "Four Roses", label: "Single Barrel", category: "Bourbon", bottleCount: null });
  });
  it("says where each fact comes from: the label's, or only a bottle has it", () => {
    expect(byLabel(rail, "Proof")).toMatchObject({ value: "100", source: "label" });
    expect(byLabel(rail, "MSRP")).toMatchObject({ source: "label" });
    expect(byLabel(rail, "Price paid")).toMatchObject({ value: "$47.00", source: "bottle" });
    expect(byLabel(rail, "Store")).toMatchObject({ value: "Binny's", source: "bottle" });
  });
  it("shows this bottle's own proof or size with the label's alongside, and the label's alone when it has none", () => {
    const own = railFor(row(bottle({ proof: "104.2", sizeMl: 1000 })), ctx, both, {}, null);
    expect(byLabel(own, "Proof")).toMatchObject({ value: "104.2", source: "own", alongside: "100" });
    expect(own.facts.find((f) => f.label.startsWith("Size"))).toMatchObject({ value: "1000 mL", source: "own", alongside: "750 mL" });
    expect(byLabel(rail, "Proof")).toMatchObject({ source: "label" });
    expect(byLabel(rail, "Proof")?.alongside).toBeUndefined();
  });
  it("shows an edit not yet read back, as the sheet does", () => {
    const edited = railFor(row(), ctx, both, { b7: { pricePaid: "52", ownProof: "99" }, l1: { msrp: "55" } }, null);
    expect(byLabel(edited, "Price paid")?.value).toBe("$52.00");
    expect(byLabel(edited, "Proof")).toMatchObject({ value: "99", source: "own", alongside: "100" });
    expect(byLabel(edited, "MSRP")?.value).toBe("$55.00");
  });
  it("lists what is still blank, short, in the order worth filling", () => {
    const bare = railFor(row(bottle({ pricePaid: null, storeName: null, dateAcquired: null }), label({ proof: null, msrp: null, links: { distilleries: [], mashbills: [], finishes: [] } })), ctx, both, {}, null);
    expect(bare.blank).toEqual(["Proof", "Distillery", "MSRP", "Price paid"]); // four at most
    expect(rail.blank).toEqual([]);
  });
  it("leaves out a fact with nothing in it, rather than listing a dash", () => {
    expect(rail.facts.some((f) => f.value === "—" || f.value === "")).toBe(false);
  });
});

describe("the rail for a label (Labels only)", () => {
  const rail = railFor(row(null), ctx, labelsOnly, {}, null);
  it("names the label and says how many bottles it has", () => {
    expect(rail).toMatchObject({ kind: "label", brand: "Four Roses", label: "Single Barrel", bottleCount: 3 });
  });
  it("shows the label's facts only, none of a bottle's", () => {
    expect(byLabel(rail, "Proof")).toMatchObject({ source: "label" });
    expect(rail.facts.some((f) => f.source !== "label")).toBe(false);
    expect(rail.blank).not.toContain("Price paid");
  });
  it("reflects a rename not yet saved", () => {
    expect(railFor(row(null, label({ name: "Select" })), ctx, labelsOnly, {}, null).label).toBe("Select");
  });
});

describe("the rail for a new row", () => {
  const draft = (labelChosen: boolean): SheetRow => ({ ...row(bottle({ id: -1 }), label({ id: -1, brand: "Zebra", name: labelChosen ? "Hollow" : "", bottleCount: 0 })), key: "d0", draft: { brandChosen: true, labelChosen, brandIsNew: true, labelIsNew: true } });
  it("is a new row until a label is chosen, then a bottle", () => {
    expect(railFor(draft(false), ctx, both, {}, null).kind).toBe("new");
    expect(railFor(draft(true), ctx, both, {}, null).kind).toBe("bottle");
  });
  it("has no photo until it is named, and never a bottle count", () => {
    const photo = { path: "x.jpg", isCutout: false };
    expect(railFor(draft(false), ctx, both, {}, photo).photo).not.toBeNull(); // brand typed: named
    const empty = { ...draft(false), label: label({ id: -1, brand: "", name: "" }) };
    expect(railFor(empty, ctx, both, {}, photo).photo).toBeNull();
    expect(railFor(draft(true), ctx, both, {}, null).bottleCount).toBeNull();
  });
});

describe("the photo", () => {
  it("is passed through for a named row", () => {
    const photo = { path: "t/1.jpg", isCutout: true };
    expect(railFor(row(), ctx, both, {}, photo).photo).toBe(photo);
  });
});
