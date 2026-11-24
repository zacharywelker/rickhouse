import { describe, expect, it } from "vitest";
import { searchLabels, type LabelDoc } from "@/lib/expressions/label-search";
import { groupHref } from "@/lib/groups/rail";
import { navSearch, newLabelHref, type NavSearchData } from "../search";

function label(id: number, brand: string, name: string, overrides: Partial<LabelDoc> = {}): LabelDoc {
  return {
    id, brand, name, categoryId: 1, category: "Bourbon",
    categoryPath: [{ id: 1, name: "Bourbon" }], distilleries: [], finishes: [],
    upc: null, ttbIds: [], proof: null, bottles: 0, ...overrides,
  };
}

const data: NavSearchData = {
  labels: [
    label(1, "Elijah Craig", "Barrel Proof", { proof: "128", bottles: 1 }),
    label(2, "Elijah Craig", "Small Batch", { proof: "94" }),
    label(3, "Blanton's", "Original", { upc: "080244002039", ttbIds: ["12345678901234"] }),
    label(4, "Eagle Rare", "Ten Year", { distilleries: ["Buffalo Trace"] }),
  ],
  ownedBottles: [
    { id: 11, expressionId: 1, brand: "Elijah Craig", name: "Barrel Proof", category: "Bourbon", proof: "128", isOpen: true, fillPct: 65 },
  ],
  brands: [{ id: 21, name: "Buffalo Trace", labels: 1, bottles: 1 }],
  distilleries: [{ id: 31, name: "Buffalo Trace", labels: 2, bottles: 0, place: "Frankfort, KY" }],
  groups: [
    { id: 41, name: "Elijah Favorites", filterQuery: null },
    { id: 42, name: "Buffalo Picks", filterQuery: "pick=1" },
  ],
};

describe("navSearch", () => {
  it("shows owned bottles and unowned labels without duplicating a label", () => {
    const result = navSearch(data, "elijah");
    expect(result.bottles).toEqual([{
      key: "bottle-11", title: "Elijah Craig Barrel Proof", detail: "Bourbon · 128 proof · open, 65%", href: "/bottles/11",
    }]);
    expect(result.labels).toEqual([{
      key: "label-2", title: "Elijah Craig Small Batch", detail: "Bourbon · 94 proof · no bottle", href: "/expressions/2",
    }]);
    expect(result.newLabelHref).toBe("/expressions/new?name=elijah");
  });

  it.each(["", "   ", "!!"])("returns no results or new-label link for %j", (query) => {
    expect(navSearch(data, query)).toEqual({
      bottles: [], labels: [], brands: [], distilleries: [], groups: [], newLabelHref: null,
    });
  });

  it.each(["Blanton's", "blantons", "BLANTON’S"])("normalises apostrophes and case in %s", (query) => {
    expect(navSearch(data, query).labels).toEqual([{
      key: "label-3", title: "Blanton's Original", detail: "Bourbon · no bottle", href: "/expressions/3",
    }]);
  });

  it.each(["080244002039", "12345678901234"])("finds an exact UPC or TTB code %s first", (query) => {
    expect(navSearch(data, query).labels[0]?.key).toBe("label-3");
  });

  it("omits labels found only through their distillery", () => {
    expect(navSearch(data, "buffalo").labels).toEqual([]);
  });

  it("limits unowned labels to three while preserving search hit order", () => {
    const labels = Array.from({ length: 5 }, (_, i) => label(100 + i, "Matching", `Label ${i}`));
    const result = navSearch({ ...data, labels }, "matching");
    expect(result.labels.map((row) => row.key)).toEqual(
      searchLabels(labels, "matching", { limit: Number.POSITIVE_INFINITY }).hits.slice(0, 3).map((hit) => `label-${hit.doc.id}`),
    );
    expect(result.labels).toHaveLength(3);
  });

  it("keeps each label's bottles in input order and limits them to three", () => {
    const ownedBottles = [15, 12, 14, 13, 16].map((id) => ({ ...data.ownedBottles[0]!, id, proof: null, isOpen: false }));
    const result = navSearch({ ...data, ownedBottles }, "elijah");
    expect(result.bottles.map((row) => row.key)).toEqual(["bottle-15", "bottle-12", "bottle-14"]);
    expect(result.bottles[0]?.detail).toBe("Bourbon · sealed");
    expect(result.labels.map((row) => row.key)).toEqual(["label-2"]);
  });

  it("accepts a 500-character query", () => {
    expect(() => navSearch(data, "a".repeat(500))).not.toThrow();
  });

  it("links brands to Collection and uses singular counts for exactly one", () => {
    expect(navSearch(data, "buffalo").brands).toEqual([{
      key: "brand-21", title: "Buffalo Trace", detail: "1 label · 1 bottle", href: "/bottles?brand=21",
    }]);
  });

  it("includes a distillery's place and plural counts", () => {
    expect(navSearch(data, "buffalo").distilleries).toEqual([{
      key: "distillery-31", title: "Buffalo Trace", detail: "Frankfort, KY · 2 labels · 0 bottles", href: "/bottles?distillery=31",
    }]);
    expect(navSearch({ ...data, distilleries: [{ ...data.distilleries[0]!, place: null }] }, "buffalo").distilleries[0]?.detail)
      .toBe("2 labels · 0 bottles");
  });

  it("links matching hand-picked and smart groups using groupHref", () => {
    expect(navSearch(data, "elijah").groups).toEqual([{
      key: "group-41", title: "Elijah Favorites", detail: "Group", href: "/bottles?group=41",
    }]);
    expect(navSearch(data, "buffalo").groups[0]?.href).toBe(groupHref(data.groups[1]!));
    expect(navSearch(data, "buffalo").groups[0]?.href).toBe("/bottles?pick=1");
  });

  it("matches every deduplicated word as a substring, sorts prefix names first, and caps each reference group", () => {
    const names = ["Old Buffalo Trace", "Buffalo Trace Zebra", "Buffalo Trace Alpha", "Buffalo Trace Beta", "Buffalo Other"];
    const refs = names.map((name, id) => ({ id, name, labels: 0, bottles: 2 }));
    const fixture = {
      ...data, brands: refs, distilleries: refs.map((ref) => ({ ...ref, place: null })),
      groups: refs.map((ref) => ({ id: ref.id, name: ref.name, filterQuery: null })),
    };
    const result = navSearch(fixture, "búff alo trace trace");
    for (const rows of [result.brands, result.distilleries, result.groups]) {
      expect(rows.map((row) => row.title)).toEqual(["Buffalo Trace Alpha", "Buffalo Trace Beta", "Buffalo Trace Zebra"]);
    }
  });
});

describe("newLabelHref", () => {
  it("encodes spaces in the new label name", () => {
    expect(newLabelHref("elijah craig")).toBe("/expressions/new?name=elijah%20craig");
  });

  it("trims the query and encodes special characters", () => {
    expect(newLabelHref("  a & b ")).toBe("/expressions/new?name=a%20%26%20b");
  });
});

describe("proof in a result's detail line", () => {
  it("drops the database's trailing zeros", () => {
    const data: NavSearchData = {
      labels: [],
      ownedBottles: [
        { id: 1, expressionId: 1, brand: "Elijah Craig", name: "Barrel Proof", category: "Bourbon", proof: "125.60", isOpen: false, fillPct: 100 },
      ],
      brands: [],
      distilleries: [],
      groups: [],
    };
    const base = { id: 1, brand: "Elijah Craig", name: "Barrel Proof", categoryId: 1, category: "Bourbon", categoryPath: [], distilleries: [], finishes: [], upc: null, ttbIds: [], proof: "125.60", bottles: 1 };
    const result = navSearch({ ...data, labels: [base] }, "elijah");
    expect(result.bottles[0]?.detail).toBe("Bourbon · 125.6 proof · sealed");
  });
});
