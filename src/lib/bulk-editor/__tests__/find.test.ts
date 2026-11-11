import { describe, expect, it } from "vitest";
import { ageInYears, ageOf, effectiveFind, filterCount, labelAgeYears, type FindContext, filterRows, haystack, isSortable, matchesSearch, nextSort, NO_FIND, NO_RANGE, proofOf, sortRows, type Find } from "../find";
import type { SheetBottle, SheetLabel, SheetRow } from "../sheet";

type LabelOver = { msrp?: string | null; ageYears?: string | null; ageStatement?: string | null; links?: Partial<SheetLabel["links"]> };
const label = (id: number, brandId: number, brand: string, name: string, categoryId: number, category: string, proof: string | null = null, over: LabelOver = {}) =>
  ({
    id, brandId, brand, name, categoryId, category, proof, sizeMl: 750, msrp: over.msrp ?? null, upc: null, bottleCount: 1,
    ageYears: over.ageYears ?? null, ageMonths: null, ageDays: null, ageStatement: over.ageStatement ?? null,
    links: { distilleries: [{ id: 1, label: "Four Roses Distillery", amount: "" }], mashbills: [], finishes: [], ingredients: [], ...over.links },
  }) as unknown as SheetLabel;
const bottle = (id: number, over: Partial<SheetBottle> = {}) =>
  ({ id, status: "owned", pricePaid: null, storeName: null, pickName: null, notes: null, location: null, dateAcquired: null, proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ...over }) as unknown as SheetBottle;

const gin = label(1, 1, "Hendrick's", "Gin", 10, "Gin", "88");
const bourbon = label(2, 2, "Four Roses", "Single Barrel", 20, "Bourbon", "100");
const rye = label(3, 3, "Rittenhouse", "Rye Bonded", 21, "Rye", "100");
const rows: SheetRow[] = [
  { key: "b1", label: gin, bottle: bottle(1, { pricePaid: "35", storeName: "Total Wine" }) },
  { key: "b2", label: bourbon, bottle: bottle(2, { pricePaid: "50", storeName: "Binny's", pickName: "Barrel OESV" }) },
  { key: "b3", label: rye, bottle: bottle(3, { pricePaid: null, storeName: "Binny's" }) },
];
const find = (over: Partial<Find>): Find => ({ ...NO_FIND, ...over });
const ctx: FindContext = { kinds: { 20: "american", 21: "american" } };
const keys = (rs: SheetRow[]) => rs.map((r) => r.key);
const none = () => false;

describe("search", () => {
  it("finds a row by any word, in any order, from the label or the bottle", () => {
    expect(matchesSearch(rows[1]!, "four roses")).toBe(true);
    expect(matchesSearch(rows[1]!, "roses four")).toBe(true);
    expect(matchesSearch(rows[1]!, "binnys oesv")).toBe(true); // apostrophes are dropped, as in the tables
    expect(matchesSearch(rows[1]!, "four roses gin")).toBe(false);
  });
  it("finds a label by its distillery, and a bottle by its store", () => {
    expect(matchesSearch(rows[0]!, "distillery")).toBe(true);
    expect(filterRows(rows, find({ q: "total wine" }), none, ctx).map((r) => r.key)).toEqual(["b1"]);
  });
  it("is blind to case and accents", () => {
    expect(matchesSearch({ ...rows[0]!, label: label(1, 1, "Hendrick's", "Gin", 10, "Gin") }, "HENDRICKS")).toBe(true);
    expect(haystack(rows[0]!)).toContain("hendricks");
  });
});

describe("filters", () => {
  it("narrows by category, brand and store, all of which must hold", () => {
    expect(keys(filterRows(rows, find({ categoryIds: [10] }), none, ctx))).toEqual(["b1"]);
    expect(keys(filterRows(rows, find({ brandIds: [2, 3] }), none, ctx))).toEqual(["b2", "b3"]);
    expect(keys(filterRows(rows, find({ stores: ["Binny's"] }), none, ctx))).toEqual(["b2", "b3"]);
    expect(keys(filterRows(rows, find({ stores: ["Binny's"], categoryIds: [21] }), none, ctx))).toEqual(["b3"]);
  });
  it("shows everything, as the same rows, when nothing is set", () => {
    expect(keys(filterRows(rows, NO_FIND, none, ctx))).toEqual(["b1", "b2", "b3"]);
    expect(filterCount(NO_FIND)).toBe(0);
    expect(filterCount(find({ q: "x", categoryIds: [1], stores: ["a"] }))).toBe(3);
    expect(filterCount(find({ sort: { column: "brand", desc: false } }))).toBe(0); // a sort hides nothing
  });
  it("store and price paid are in force only when looking at bottles alone, and off (not applied, not counted) elsewhere", () => {
    const f = find({ stores: ["Binny's"], price: { min: 100, max: null }, categoryIds: [10] });
    const bottlesAlone = { labels: false, bottles: true };
    expect(effectiveFind(f, bottlesAlone)).toBe(f);
    for (const view of [{ labels: true, bottles: true }, { labels: true, bottles: false }]) {
      const off = effectiveFind(f, view);
      expect(off.stores).toEqual([]);
      expect(off.price).toEqual(NO_RANGE);
      expect(off.categoryIds).toEqual([10]); // everything else stays
      expect(filterCount(off)).toBe(1);
    }
    expect(filterCount(effectiveFind(f, bottlesAlone))).toBe(3);
  });
  it("does not change the values, so they are there again on coming back to bottles alone", () => {
    const f = find({ stores: ["Binny's"] });
    effectiveFind(f, { labels: true, bottles: true });
    expect(f.stores).toEqual(["Binny's"]);
  });
  it("keeps a row that has been worked on whatever the filter says", () => {
    const worked = (row: SheetRow) => row.key === "b2";
    // Looking at gin, a bourbon is typed: it stays.
    expect(keys(filterRows(rows, find({ categoryIds: [10] }), worked, ctx))).toEqual(["b1", "b2"]);
    expect(keys(filterRows(rows, find({ q: "zzz" }), worked, ctx))).toEqual(["b2"]);
  });
});

describe("sort", () => {
  const baseline = new Map(rows.map((r) => [r.key, r]));
  it("sorts by a column, ascending then descending, with empty values last either way", () => {
    expect(keys(sortRows(rows, { column: "pricePaid", desc: false }, baseline, ctx))).toEqual(["b1", "b2", "b3"]);
    expect(keys(sortRows(rows, { column: "pricePaid", desc: true }, baseline, ctx))).toEqual(["b2", "b1", "b3"]);
  });
  it("sorts text without regard to case, and numbers as numbers", () => {
    expect(keys(sortRows(rows, { column: "brand", desc: true }, baseline, ctx))).toEqual(["b3", "b1", "b2"]);
    const ten = { key: "b9", label: label(9, 9, "A", "A", 1, "X", "9"), bottle: bottle(9) };
    expect(keys(sortRows([...rows, ten], { column: "proof", desc: false }, new Map([...baseline, ["b9", ten]]), ctx))).toEqual(["b9", "b1", "b2", "b3"]); // 9 before 88, not after "100"
  });
  it("breaks ties in the usual shelf order", () => {
    expect(keys(sortRows(rows, { column: "proof", desc: false }, baseline, ctx))).toEqual(["b1", "b2", "b3"]);
  });
  it("leaves a row where it was when it is edited: it is placed by what it had when the sheet loaded", () => {
    const edited = rows.map((r) => (r.key === "b1" ? { ...r, bottle: bottle(1, { pricePaid: "999", storeName: "Total Wine" }) } : r));
    expect(keys(sortRows(edited, { column: "pricePaid", desc: false }, baseline, ctx))).toEqual(["b1", "b2", "b3"]);
  });
  it("returns the rows as they are with no sort, or for a column that cannot be sorted", () => {
    expect(keys(sortRows(rows, null, baseline, ctx))).toEqual(["b1", "b2", "b3"]);
    expect(keys(sortRows([...rows].reverse(), { column: "designation", desc: false }, baseline, ctx))).toEqual(["b3", "b2", "b1"]);
    expect(isSortable("pricePaid")).toBe(true);
    expect(isSortable("designation")).toBe(false);
  });
  it("cycles ascending, descending, off on repeated clicks, and starts over on another column", () => {
    const first = nextSort(null, "proof");
    expect(first).toEqual({ column: "proof", desc: false });
    const second = nextSort(first, "proof");
    expect(second).toEqual({ column: "proof", desc: true });
    expect(nextSort(second, "proof")).toBeNull();
    expect(nextSort(second, "brand")).toEqual({ column: "brand", desc: false });
  });
});

describe("the detail filters", () => {
  const a = label(11, 1, "A", "Aged", 20, "Bourbon", "100", { ageYears: "12", msrp: "60", links: { distilleries: [{ id: 5, label: "Heaven Hill", amount: "" }], mashbills: [{ id: 7, label: "Rye mash", amount: "" }], finishes: [{ id: 3, label: "Port", amount: "" }], ingredients: [{ name: "Cherry", family: null, kind: "flavor", isManual: false }] } });
  const b = label(12, 1, "A", "Young", 20, "Bourbon", "90", { ageStatement: "4 to 6 years", msrp: "25" });
  const c = label(13, 1, "A", "Nothing", 20, "Bourbon", null);
  const rs: SheetRow[] = [
    { key: "b1", label: a, bottle: bottle(1, { pricePaid: "80", proof: "104" }) },
    { key: "b2", label: b, bottle: bottle(2, { pricePaid: "20" }) },
    { key: "b3", label: c, bottle: bottle(3) },
  ];
  const ids = (f: Partial<Find>) => filterRows(rs, find(f), none, ctx).map((r) => r.key);

  it("filters by distillery, mashbill, finish and ingredient", () => {
    expect(ids({ distilleryIds: [5] })).toEqual(["b1"]);
    expect(ids({ distilleryIds: [1] })).toEqual(["b2", "b3"]); // the default fixture distillery
    expect(ids({ mashbillIds: [7] })).toEqual(["b1"]);
    expect(ids({ finishIds: [3] })).toEqual(["b1"]);
    expect(ids({ ingredients: ["Cherry"] })).toEqual(["b1"]);
    expect(ids({ ingredients: ["Cherry", "Nothing here"] })).toEqual(["b1"]); // any of them
  });
  it("filters by proof range on the proof a row has: its bottle's own, else its label's", () => {
    expect(proofOf(rs[0]!)).toBe(104);
    expect(ids({ proof: { min: 100, max: null } })).toEqual(["b1"]); // b1's bottle is 104 though its label says 100
    expect(ids({ proof: { min: 85, max: 95 } })).toEqual(["b2"]);
    expect(ids({ proof: { min: null, max: 95 } })).toEqual(["b2"]); // a row with no proof is out, as in the table
  });
  it("filters by age range, reading a statement when no age is entered", () => {
    expect(ids({ age: { min: 10, max: null } })).toEqual(["b1"]);
    expect(ids({ age: { min: 3, max: 8 } })).toEqual(["b2"]); // "4 to 6 years" is 4
    expect(ids({ age: { min: 0, max: 100 } })).toEqual(["b1", "b2"]); // no age at all: out
  });
  it("filters by price paid and by MSRP, each its own range", () => {
    expect(ids({ price: { min: 50, max: null } })).toEqual(["b1"]);
    expect(ids({ price: { min: null, max: 30 } })).toEqual(["b2"]);
    expect(ids({ msrp: { min: 30, max: null } })).toEqual(["b1"]);
  });
  it("counts each filter once, a range with either end set counting, and a range with neither not", () => {
    expect(filterCount(find({ proof: { min: 1, max: null }, age: { min: null, max: 9 }, price: NO_RANGE }))).toBe(2);
    expect(filterCount(find({ distilleryIds: [1, 2], ingredients: ["x"] }))).toBe(2);
  });
  it("combines them all: every filter set must hold", () => {
    expect(ids({ distilleryIds: [5], age: { min: 20, max: null } })).toEqual([]);
  });
});

describe("age", () => {
  const parts = (over: Partial<Parameters<typeof ageInYears>[0]>) => ({ ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, ...over });
  it("adds entered years, months and days", () => {
    expect(ageInYears(parts({ ageYears: "2", ageMonths: 6 }))).toBe(2.5);
    expect(ageInYears(parts({ ageMonths: 18 }))).toBe(1.5);
  });
  it("reads the youngest age from a statement: a range, or a single year", () => {
    expect(ageInYears(parts({ ageStatement: "Aged 8 to 12 years" }))).toBe(8);
    expect(ageInYears(parts({ ageStatement: "6-9 yrs" }))).toBe(6);
    expect(ageInYears(parts({ ageStatement: "12 Year Old" }))).toBe(12);
    expect(ageInYears(parts({ ageStatement: "NAS" }))).toBeNull();
    expect(ageInYears(parts({}))).toBeNull();
  });
  it("prefers entered figures to the statement", () => {
    expect(ageInYears(parts({ ageYears: "10", ageStatement: "4 years" }))).toBe(10);
  });
  it("uses a bottle's own age over its label's", () => {
    const l = label(1, 1, "A", "B", 1, "C", null, { ageYears: "12" });
    expect(ageOf({ key: "b1", label: l, bottle: bottle(1) }, ctx)).toBe(12);
    expect(ageOf({ key: "b1", label: l, bottle: bottle(1, { ageYears: "9" }) }, ctx)).toBe(9);
  });
});

describe("sorting the age and link columns", () => {
  const l1 = label(1, 1, "A", "One", 1, "C", null, { ageYears: "12", links: { distilleries: [{ id: 2, label: "Zed", amount: "" }], finishes: [{ id: 1, label: "Port", amount: "" }] } });
  const l2 = label(2, 1, "A", "Two", 1, "C", null, { ageYears: "4", links: { distilleries: [{ id: 1, label: "Alpha", amount: "" }], finishes: [] } });
  const l3 = label(3, 1, "A", "Three", 1, "C", null, { links: { distilleries: [], finishes: [{ id: 2, label: "Sherry", amount: "" }] } });
  const rs: SheetRow[] = [l1, l2, l3].map((l, i) => ({ key: `b${i + 1}`, label: l, bottle: bottle(i + 1) }));
  const base = new Map(rs.map((r) => [r.key, r]));
  it("sorts by age as a number, labels with none last either way", () => {
    expect(keys(sortRows(rs, { column: "age", desc: false }, base, ctx))).toEqual(["b2", "b1", "b3"]);
    expect(keys(sortRows(rs, { column: "age", desc: true }, base, ctx))).toEqual(["b1", "b2", "b3"]);
  });
  it("sorts by distillery and by finish, by their names, empty last", () => {
    expect(keys(sortRows(rs, { column: "distilleries", desc: false }, base, ctx))).toEqual(["b2", "b1", "b3"]);
    expect(keys(sortRows(rs, { column: "finishes", desc: false }, base, ctx))).toEqual(["b1", "b3", "b2"]);
    expect(keys(sortRows(rs, { column: "finishes", desc: true }, base, ctx))).toEqual(["b3", "b1", "b2"]);
  });
  it("says these columns can be sorted", () => {
    for (const id of ["age", "ownAge", "distilleries", "mashbills", "finishes"]) expect(isSortable(id)).toBe(true);
    expect(isSortable("designation")).toBe(false);
  });
});

describe("a whiskey's age includes the minimum its designation implies, as the Age column does", () => {
  const whiskey = (over: Record<string, unknown>) => ({ ...label(1, 1, "A", "B", 20, "Bourbon"), fieldGroup: "whiskey", isStraight: false, isNas: false, isBottledInBond: false, isAged: false, ...over }) as unknown as SheetLabel;
  it("is 4 years for a bonded bourbon with no age written down, and 2 for a straight one", () => {
    expect(labelAgeYears(whiskey({ isBottledInBond: true }), ctx)).toBe(4);
    expect(labelAgeYears(whiskey({ isStraight: true }), ctx)).toBe(2);
    expect(labelAgeYears(whiskey({}), ctx)).toBeNull();
  });
  it("prefers what is written down to the implied minimum", () => {
    expect(labelAgeYears(whiskey({ isBottledInBond: true, ageYears: "9" }), ctx)).toBe(9);
  });
  it("has none for a vodka, or an amaro that is not aged", () => {
    expect(labelAgeYears(whiskey({ fieldGroup: "vodka", ageYears: "3" }), ctx)).toBeNull();
    expect(labelAgeYears(whiskey({ fieldGroup: "amaro", isAged: false, ageYears: "3" }), ctx)).toBeNull();
  });
  it("is what the age filter and sort use", () => {
    const bonded = { key: "b1", label: whiskey({ isBottledInBond: true }), bottle: bottle(1) };
    expect(filterRows([bonded], find({ age: { min: 3, max: 5 } }), none, ctx)).toHaveLength(1);
    expect(filterRows([bonded], find({ age: { min: 5, max: null } }), none, ctx)).toHaveLength(0);
  });
});
