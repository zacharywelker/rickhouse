import { describe, expect, it } from "vitest";
import { indexSheet, markerFor, resolve } from "../resolve";
import type { SheetBottle, SheetContext, SheetLabel, SheetRow, SheetVintage } from "../sheet";

const label = (over: Record<string, unknown> = {}) =>
  ({ id: 1, brand: "B", name: "L", categoryId: 5, fieldGroup: "whiskey", proof: "90", sizeMl: 750, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", isNas: false, isStraight: false, isBottledInBond: false, isCaskStrength: false, tequilaClass: null, brandyGrade: null, ...over }) as unknown as SheetLabel;
const bottle = (over: Record<string, unknown> = {}) =>
  ({ id: 7, expressionId: 1, releaseId: null, proof: null, sizeMl: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", ginIsNas: null, tequilaClass: null, brandyGrade: null, isSingleBarrel: false, isSingleBarrelPick: false, ...over }) as unknown as SheetBottle;
const vintage = (over: Record<string, unknown> = {}): SheetVintage => ({ id: 70, labelId: 1, name: "2025A", proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ageYearsSource: "entered", ...over }) as SheetVintage;
const row = (l: SheetLabel, b: SheetBottle | null): SheetRow => ({ key: b ? `b${b.id}` : `l${l.id}`, label: l, bottle: b });
const ctxFor = (labels: SheetLabel[], bottles: SheetBottle[], vintages: SheetVintage[]): SheetContext => ({ currency: "USD", kinds: { 5: "american" }, index: indexSheet(labels, bottles, vintages) });

describe("resolve: the bottle's own value, else its vintage's, else the label's", () => {
  it("takes a bottle's own proof first and marks it B, or SB, PS or SB PS when it is a single barrel or a private selection", () => {
    const l = label();
    const v = vintage({ proof: "112" });
    const plain = bottle({ releaseId: 70, proof: "119" });
    const ctx = ctxFor([l], [plain], [v]);
    expect(resolve("proof", row(l, plain), ctx)).toMatchObject({ value: "119", level: "bottle", marker: "B" });
    expect(resolve("proof", row(l, bottle({ releaseId: 70, proof: "119", isSingleBarrelPick: true })), ctx).marker).toBe("PS");
    expect(resolve("proof", row(l, bottle({ releaseId: 70, proof: "119", isSingleBarrel: true })), ctx).marker).toBe("SB");
    expect(resolve("proof", row(l, bottle({ releaseId: 70, proof: "119", isSingleBarrel: true, isSingleBarrelPick: true })), ctx).marker).toBe("SB PS");
  });
  it("shows the vintage's proof, marked V, for a bottle with none of its own", () => {
    const l = label();
    const b = bottle({ releaseId: 70 });
    expect(resolve("proof", row(l, b), ctxFor([l], [b], [vintage({ proof: "112" })]))).toMatchObject({ value: "112", level: "vintage", marker: "V" });
  });
  it("falls through to the label, with no marker, when the vintage has no proof of its own", () => {
    const l = label();
    const b = bottle({ releaseId: 70 });
    expect(resolve("proof", row(l, b), ctxFor([l], [b], [vintage()]))).toMatchObject({ value: "90", level: "label", marker: null });
  });
  it("skips the vintage for size and the spirit overrides, which a vintage does not have", () => {
    const l = label({ sizeMl: 750, tequilaClass: "blanco" });
    const b = bottle({ releaseId: 70, sizeMl: 1000 });
    const ctx = ctxFor([l], [b], [vintage({ proof: "112" })]);
    expect(resolve("sizeMl", row(l, b), ctx)).toMatchObject({ value: "1000", level: "bottle" });
    expect(resolve("sizeMl", row(l, bottle({ releaseId: 70 })), ctx)).toMatchObject({ value: "750", level: "label" });
    expect(resolve("tequilaClass", row(l, bottle({ releaseId: 70 })), ctx)).toMatchObject({ value: "blanco", level: "label", marker: null });
  });
});

describe("resolve: an age a designation implies is the label's, and last", () => {
  it("is not shown over a vintage's own age (the Pinhook case)", () => {
    const l = label({ isStraight: true });
    const b = bottle({ releaseId: 70 });
    const r = resolve("ageYears", row(l, b), ctxFor([l], [b], [vintage({ ageYears: "7" })]));
    expect(r).toMatchObject({ value: "7", level: "vintage", derived: false });
  });
  it("is the label's value, marked derived, only where no bottle or vintage age exists", () => {
    const l = label({ isStraight: true });
    const b = bottle({ releaseId: 70 });
    const r = resolve("ageYears", row(l, b), ctxFor([l], [b], [vintage()]));
    expect(r).toMatchObject({ value: "2", level: "label", derived: true, marker: null });
  });
});

describe("resolve: Varies", () => {
  it("is shown on a label whose vintages disagree and which has no value of its own", () => {
    const l = label({ proof: null });
    const r = resolve("proof", row(l, null), ctxFor([l], [], [vintage({ id: 70, proof: "112" }), vintage({ id: 71, name: "2026A", proof: "107.4" })]));
    expect(r).toMatchObject({ varies: true, value: null });
  });
  it("is shown when vintages have different age statements, and not when they agree", () => {
    const l = label({ ageStatement: null });
    const two = [vintage({ id: 70, ageStatement: "Straight" }), vintage({ id: 71, name: "2026A", ageStatement: "Over 4 years" })];
    expect(resolve("ageStatement", row(l, null), ctxFor([l], [], two)).varies).toBe(true);
    const same = [vintage({ id: 70, ageStatement: "Straight" }), vintage({ id: 71, name: "2026A", ageStatement: "straight " })];
    expect(resolve("ageStatement", row(l, null), ctxFor([l], [], same)).varies).toBe(false);
  });
  it("is not shown when every vintage has the same proof", () => {
    const l = label({ proof: null });
    const r = resolve("proof", row(l, null), ctxFor([l], [], [vintage({ id: 70, proof: "112" }), vintage({ id: 71, name: "2026A", proof: "112" })]));
    expect(r).toMatchObject({ varies: false, value: null });
  });
  it("is shown on a cask strength label with no proof whose bottles have different proofs of their own", () => {
    const l = label({ proof: null, isCaskStrength: true });
    const bs = [bottle({ id: 7, proof: "110" }), bottle({ id: 8, proof: "118" })];
    expect(resolve("proof", row(l, null), ctxFor([l], bs, [])).varies).toBe(true);
  });
});

describe("markerFor", () => {
  it("is V for a vintage, a letter pair for the flags, B for a bottle's own, and nothing for the label", () => {
    const b = bottle();
    expect(markerFor(row(label(), b), "vintage")).toBe("V");
    expect(markerFor(row(label(), b), "bottle")).toBe("B");
    expect(markerFor(row(label(), b), "label")).toBeNull();
    expect(markerFor(row(label(), bottle({ isSingleBarrelPick: true })), "bottle")).toBe("PS");
  });
});
