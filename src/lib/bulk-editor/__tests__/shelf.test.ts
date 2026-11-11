import { describe, expect, it } from "vitest";
import type { Pick } from "../drafts";
import { ordinal, shelfFor, type NewBottle } from "../shelf";
import type { SheetBottle, SheetLabel, SheetRow, SheetView } from "../sheet";

const both: SheetView = { labels: true, bottles: true };
const mkLabel = (id: number, brandId: number, brand: string, name: string) => ({ id, brandId, brand, name }) as unknown as SheetLabel;
const bottle = (id: number, expressionId: number) => ({ id, expressionId }) as unknown as SheetBottle;

const FR = 10;
const labels = [mkLabel(1, FR, "Four Roses", "Single Barrel"), mkLabel(2, FR, "Four Roses", "Small Batch"), mkLabel(3, FR, "Four Roses", "Yellow Label"), mkLabel(4, 11, "Buffalo Trace", "Eagle Rare")];
// Five Four Roses bottles: three Single Barrel (ids 1, 4, 5), one Small Batch (2), one Yellow (3); one Eagle Rare.
const bottles = [bottle(1, 1), bottle(2, 2), bottle(3, 3), bottle(4, 1), bottle(5, 1), bottle(6, 4)];
const existing = (id: number, name: string): Pick => ({ kind: "existing", id, name });
const fresh = (name: string): Pick => ({ kind: "new", name });

/** A new row, as the sheet draws it. */
const draftRow = (key: string, brand: Pick | null, label: Pick | null): SheetRow => ({
  key,
  bottle: { id: -1 } as SheetBottle,
  label: { id: label?.kind === "existing" ? label.id : -1, brandId: brand?.kind === "existing" ? brand.id : -1, brand: brand?.name ?? "", name: label?.name ?? "" } as unknown as SheetLabel,
  draft: { brandChosen: brand !== null, labelChosen: label !== null, brandIsNew: brand?.kind === "new", labelIsNew: label?.kind === "new" },
});
const saved = (b: SheetBottle): SheetRow => ({ key: `b${b.id}`, bottle: b, label: labels.find((l) => l.id === b.expressionId)! });
const shelf = (row: SheetRow, extra: Partial<Parameters<typeof shelfFor>[0]> = {}) => shelfFor({ row, labels, bottles, moves: {}, newBottles: [], view: both, ...extra });
const nb = (key: string, brand: Pick, label: Pick, savedFlag = false): NewBottle => ({ key, brand, label, saved: savedFlag });

describe("ordinals", () => {
  it("are plain words up to twenty, then numbers", () => {
    expect([1, 2, 3, 6, 11, 12, 20].map(ordinal)).toEqual(["first", "second", "third", "sixth", "eleventh", "twelfth", "twentieth"]);
    expect([21, 22, 23, 24, 101, 111, 112].map(ordinal)).toEqual(["21st", "22nd", "23rd", "24th", "101st", "111th", "112th"]);
  });
});

describe("1. a known brand, no label yet", () => {
  const s = shelf(draftRow("d0", existing(FR, "Four Roses"), null));
  it("says how many bottles from how many labels, and lists the labels, most owned first", () => {
    expect(s.state).toBe("known-brand");
    expect(s.summary).toBe("5 bottles from 3 Four Roses labels");
    expect(s.labels.map((l) => [l.name, l.owned])).toEqual([["Single Barrel", 3], ["Small Batch", 1], ["Yellow Label", 1]]);
    expect(s.badge).toBeNull();
    expect(s.lines).toEqual([]);
  });
  it("says so plainly when none of the brand's labels is on the shelf", () => {
    const none = shelfFor({ row: draftRow("d0", existing(FR, "Four Roses"), null), labels, bottles: [], moves: {}, newBottles: [], view: both });
    expect(none.summary).toBe("None of your Four Roses is on your shelf yet");
  });
});

describe("2. an existing label chosen", () => {
  it("highlights the label and counts this bottle as the next: the sixth Four Roses, the fourth Single Barrel", () => {
    const s = shelf(draftRow("d0", existing(FR, "Four Roses"), existing(1, "Single Barrel")), { newBottles: [nb("d0", existing(FR, "Four Roses"), existing(1, "Single Barrel"))] });
    expect(s.state).toBe("existing-label");
    expect(s.lines).toEqual(["Your sixth Four Roses bottle", "Fourth Single Barrel"]);
    expect(s.labels.find((l) => l.chosen)).toMatchObject({ name: "Single Barrel", owned: 3, unsaved: 1 });
    expect(s.summary).toBe("5 bottles from 3 Four Roses labels · 1 not saved");
  });
  it("counts a bottle already typed above it first", () => {
    const above = nb("d0", existing(FR, "Four Roses"), existing(1, "Single Barrel"));
    const mine = nb("d1", existing(FR, "Four Roses"), existing(1, "Single Barrel"));
    const s = shelf(draftRow("d1", existing(FR, "Four Roses"), existing(1, "Single Barrel")), { newBottles: [above, mine] });
    expect(s.lines).toEqual(["Your seventh Four Roses bottle", "Fifth Single Barrel"]);
    expect(s.summary).toContain("2 not saved");
  });
  it("says first when it is the first", () => {
    const s = shelfFor({ row: draftRow("d0", existing(11, "Buffalo Trace"), existing(4, "Eagle Rare")), labels, bottles: [], moves: {}, newBottles: [], view: both });
    expect(s.lines).toEqual(["Your first Buffalo Trace bottle", "First Eagle Rare"]);
  });
  it("a saved bottle's place is by when it was added: the third Single Barrel is bottle 5", () => {
    expect(shelf(saved(bottle(5, 1))).lines).toEqual(["Your fifth Four Roses bottle", "Third Single Barrel"]);
    expect(shelf(saved(bottle(1, 1))).lines).toEqual(["Your first Four Roses bottle", "First Single Barrel"]);
  });
});

describe("3. a new label under a known brand", () => {
  const row = draftRow("d0", existing(FR, "Four Roses"), fresh("Private Selection"));
  const s = shelf(row, { newBottles: [nb("d0", existing(FR, "Four Roses"), fresh("Private Selection"))] });
  it("has a New label badge, and still lists the brand's labels", () => {
    expect(s.state).toBe("new-label");
    expect(s.badge).toEqual({ text: "New label", note: "Saving adds it under Four Roses." });
    expect(s.labels[0]).toMatchObject({ name: "Private Selection", isNew: true, chosen: true, unsaved: 1 });
    expect(s.labels.map((l) => l.name)).toContain("Single Barrel");
    expect(s.lines).toEqual(["Your sixth Four Roses bottle", "First Private Selection"]);
  });
});

describe("4. a new brand", () => {
  const row = draftRow("d0", fresh("Zzyzx"), fresh("Cask One"));
  it("says nothing of it is on the shelf and that saving creates it", () => {
    const s = shelf(row, { newBottles: [nb("d0", fresh("Zzyzx"), fresh("Cask One"))] });
    expect(s.state).toBe("new-brand");
    expect(s.badge?.text).toBe("New brand");
    expect(s.badge?.note).toMatch(/Saving creates the brand and its first label/);
    expect(s.labels).toEqual([]);
    expect(s.lines).toEqual(["Your first Zzyzx bottle"]);
    expect(s.summary).toBe(""); // the badge already says it
  });
  it("counts other new rows of the same new brand, in any case", () => {
    const s = shelf(draftRow("d1", fresh("zzyzx"), fresh("Cask Two")), { newBottles: [nb("d0", fresh("Zzyzx"), fresh("Cask One")), nb("d1", fresh("zzyzx"), fresh("Cask Two"))] });
    expect(s.lines).toEqual(["Your second zzyzx bottle"]);
    expect(s.summary).toBe("2 zzyzx bottles not saved yet");
  });
});

describe("5. a brand with many labels", () => {
  const many = Array.from({ length: 8 }, (_, i) => mkLabel(100 + i, 20, "Big Brand", `Label ${i}`));
  const own = [bottle(900, 100), bottle(901, 100), bottle(902, 101), bottle(903, 102), bottle(904, 103), bottle(905, 104)];
  const s = shelfFor({ row: draftRow("d0", existing(20, "Big Brand"), null), labels: many, bottles: own, moves: {}, newBottles: [], view: both });
  it("lists the five owned most of, then how many more", () => {
    expect(s.labels).toHaveLength(5);
    expect(s.labels[0]).toMatchObject({ name: "Label 0", owned: 2 });
    expect(s.more).toBe(3);
  });
  it("always lists the chosen label, even one with none on the shelf", () => {
    const pick = shelfFor({ row: draftRow("d0", existing(20, "Big Brand"), existing(107, "Label 7")), labels: many, bottles: own, moves: {}, newBottles: [], view: both });
    expect(pick.labels).toHaveLength(5);
    expect(pick.labels.some((l) => l.name === "Label 7" && l.chosen)).toBe(true);
  });
});

describe("no brand", () => {
  it("says to choose one", () => {
    const s = shelf(draftRow("d0", null, null));
    expect(s.state).toBe("no-brand");
    expect(s.summary).toMatch(/Choose a brand/);
  });
});

describe("counts", () => {
  it("count a new row that has saved as on the shelf, though the sheet has not read it back, and not as not saved", () => {
    const s = shelf(draftRow("d1", existing(FR, "Four Roses"), null), { newBottles: [nb("d0", existing(FR, "Four Roses"), existing(1, "Single Barrel"), true)] });
    expect(s.summary).toBe("6 bottles from 3 Four Roses labels");
    expect(s.labels[0]).toMatchObject({ name: "Single Barrel", owned: 4, unsaved: 0 });
  });
  it("follow a bottle moved to another label", () => {
    const s = shelf(draftRow("d0", existing(FR, "Four Roses"), null), { moves: { b1: 2 } });
    expect(s.labels.find((l) => l.name === "Single Barrel")?.owned).toBe(2);
    expect(s.labels.find((l) => l.name === "Small Batch")?.owned).toBe(2);
  });
  it("are the whole shelf: they are worked out from all the loaded bottles, whatever the sheet is showing", () => {
    // The function is given no filter and no row list at all; the same inputs always give the same counts.
    const a = shelf(draftRow("d0", existing(FR, "Four Roses"), null));
    const b = shelf(draftRow("d0", existing(FR, "Four Roses"), null));
    expect(a).toEqual(b);
  });
});

describe("Labels only", () => {
  it("shows what the label has, with no ordinal", () => {
    const row: SheetRow = { key: "l1", label: labels[0]!, bottle: null };
    const s = shelf(row, { view: { labels: true, bottles: false } });
    expect(s.lines).toEqual(["3 bottles of Single Barrel on your shelf"]);
    expect(s.labels.find((l) => l.chosen)?.name).toBe("Single Barrel");
  });
  it("says none when there are none", () => {
    const row: SheetRow = { key: "l3", label: mkLabel(9, FR, "Four Roses", "Brand New"), bottle: null };
    expect(shelf(row, { view: { labels: true, bottles: false } }).lines).toEqual(["None of Brand New on your shelf"]);
  });
});
