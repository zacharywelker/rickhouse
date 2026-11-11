import { describe, expect, it } from "vitest";
import { filterCount, filterRows, haystack, isSortable, matchesSearch, nextSort, NO_FIND, sortRows, type Find } from "../find";
import type { SheetBottle, SheetLabel, SheetRow } from "../sheet";

const label = (id: number, brandId: number, brand: string, name: string, categoryId: number, category: string, proof: string | null = null) =>
  ({ id, brandId, brand, name, categoryId, category, proof, sizeMl: 750, msrp: null, upc: null, bottleCount: 1, links: { distilleries: [{ id: 1, label: "Four Roses Distillery", amount: "" }], mashbills: [], finishes: [] } }) as unknown as SheetLabel;
const bottle = (id: number, over: Partial<SheetBottle> = {}) => ({ id, status: "owned", pricePaid: null, storeName: null, pickName: null, notes: null, location: null, dateAcquired: null, ...over }) as unknown as SheetBottle;

const gin = label(1, 1, "Hendrick's", "Gin", 10, "Gin", "88");
const bourbon = label(2, 2, "Four Roses", "Single Barrel", 20, "Bourbon", "100");
const rye = label(3, 3, "Rittenhouse", "Rye Bonded", 21, "Rye", "100");
const rows: SheetRow[] = [
  { key: "b1", label: gin, bottle: bottle(1, { pricePaid: "35", storeName: "Total Wine" }) },
  { key: "b2", label: bourbon, bottle: bottle(2, { pricePaid: "50", storeName: "Binny's", pickName: "Barrel OESV" }) },
  { key: "b3", label: rye, bottle: bottle(3, { pricePaid: null, storeName: "Binny's" }) },
];
const find = (over: Partial<Find>): Find => ({ ...NO_FIND, ...over });
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
    expect(filterRows(rows, find({ q: "total wine" }), none).map((r) => r.key)).toEqual(["b1"]);
  });
  it("is blind to case and accents", () => {
    expect(matchesSearch({ ...rows[0]!, label: label(1, 1, "Hendrick's", "Gin", 10, "Gin") }, "HENDRICKS")).toBe(true);
    expect(haystack(rows[0]!)).toContain("hendricks");
  });
});

describe("filters", () => {
  it("narrows by category, brand and store, all of which must hold", () => {
    expect(keys(filterRows(rows, find({ categoryIds: [10] }), none))).toEqual(["b1"]);
    expect(keys(filterRows(rows, find({ brandIds: [2, 3] }), none))).toEqual(["b2", "b3"]);
    expect(keys(filterRows(rows, find({ stores: ["Binny's"] }), none))).toEqual(["b2", "b3"]);
    expect(keys(filterRows(rows, find({ stores: ["Binny's"], categoryIds: [21] }), none))).toEqual(["b3"]);
  });
  it("shows everything, as the same rows, when nothing is set", () => {
    expect(keys(filterRows(rows, NO_FIND, none))).toEqual(["b1", "b2", "b3"]);
    expect(filterCount(NO_FIND)).toBe(0);
    expect(filterCount(find({ q: "x", categoryIds: [1], stores: ["a"] }))).toBe(3);
    expect(filterCount(find({ sort: { column: "brand", desc: false } }))).toBe(0); // a sort hides nothing
  });
  it("a store filter finds nothing on a label row, which has no store", () => {
    expect(filterRows([{ key: "l1", label: gin, bottle: null }], find({ stores: ["Binny's"] }), none)).toEqual([]);
  });
  it("keeps a row that has been worked on whatever the filter says", () => {
    const worked = (row: SheetRow) => row.key === "b2";
    // Looking at gin, a bourbon is typed: it stays.
    expect(keys(filterRows(rows, find({ categoryIds: [10] }), worked))).toEqual(["b1", "b2"]);
    expect(keys(filterRows(rows, find({ q: "zzz" }), worked))).toEqual(["b2"]);
  });
});

describe("sort", () => {
  const baseline = new Map(rows.map((r) => [r.key, r]));
  it("sorts by a column, ascending then descending, with empty values last either way", () => {
    expect(keys(sortRows(rows, { column: "pricePaid", desc: false }, baseline))).toEqual(["b1", "b2", "b3"]);
    expect(keys(sortRows(rows, { column: "pricePaid", desc: true }, baseline))).toEqual(["b2", "b1", "b3"]);
  });
  it("sorts text without regard to case, and numbers as numbers", () => {
    expect(keys(sortRows(rows, { column: "brand", desc: true }, baseline))).toEqual(["b3", "b1", "b2"]);
    const ten = { key: "b9", label: label(9, 9, "A", "A", 1, "X", "9"), bottle: bottle(9) };
    expect(keys(sortRows([...rows, ten], { column: "proof", desc: false }, new Map([...baseline, ["b9", ten]])))).toEqual(["b9", "b1", "b2", "b3"]); // 9 before 88, not after "100"
  });
  it("breaks ties in the usual shelf order", () => {
    expect(keys(sortRows(rows, { column: "proof", desc: false }, baseline))).toEqual(["b1", "b2", "b3"]);
  });
  it("leaves a row where it was when it is edited: it is placed by what it had when the sheet loaded", () => {
    const edited = rows.map((r) => (r.key === "b1" ? { ...r, bottle: bottle(1, { pricePaid: "999", storeName: "Total Wine" }) } : r));
    expect(keys(sortRows(edited, { column: "pricePaid", desc: false }, baseline))).toEqual(["b1", "b2", "b3"]);
  });
  it("returns the rows as they are with no sort, or for a column that cannot be sorted", () => {
    expect(keys(sortRows(rows, null, baseline))).toEqual(["b1", "b2", "b3"]);
    expect(keys(sortRows([...rows].reverse(), { column: "distilleries", desc: false }, baseline))).toEqual(["b3", "b2", "b1"]);
    expect(isSortable("pricePaid")).toBe(true);
    expect(isSortable("distilleries")).toBe(false);
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
