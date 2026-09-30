import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  DEFAULT_PAGE_SIZE,
  activeFilterCount,
  parseFilters,
  serialiseFilters,
  type BottleFilters,
} from "../filters";

const parse = (query: string) => parseFilters(Object.fromEntries(new URLSearchParams(query)));

describe("parseFilters", () => {
  it("gives a bare URL the defaults", () => {
    expect(parse("")).toEqual(DEFAULT_FILTERS);
  });

  it("reads id lists", () => {
    expect(parse("distillery=3,7,11").distilleryIds).toEqual([3, 7, 11]);
  });

  it("drops junk and duplicates from id lists", () => {
    expect(parse("brand=2,abc,2,-4,0,5").brandIds).toEqual([2, 5]);
  });

  it("keeps only known statuses", () => {
    expect(parse("status=owned,nonsense,killed").statuses).toEqual(["owned", "killed"]);
  });

  it("clamps ranges to something physical", () => {
    const filters = parse("proofMin=-10&proofMax=900&ageMin=2&priceMax=250");
    expect(filters.proof).toEqual({ min: 0, max: 200 });
    expect(filters.age).toEqual({ min: 2, max: null });
    expect(filters.price).toEqual({ min: null, max: 250 });
  });

  it("falls back on an unknown sort key or view", () => {
    expect(parse("sort=; DROP TABLE bottles").sort).toBe(DEFAULT_FILTERS.sort);
    expect(parse("view=hologram").view).toBe("table");
    expect(parse("sort=proof&view=gallery").sort).toBe("proof");
  });

  it("defaults to newest first, with ascending as the opt-in", () => {
    expect(parse("").desc).toBe(true);
    expect(parse("dir=asc").desc).toBe(false);
    expect(parse("dir=anything-else").desc).toBe(true);
  });

  it("only accepts an offered page size", () => {
    expect(parse("size=50").pageSize).toBe(50);
    expect(parse("size=7").pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("keeps only known acquisition kinds and real dates", () => {
    expect(parse("acq=gift,stolen,gift,lottery").acquisitions).toEqual(["gift", "lottery"]);
    expect(parse("acquiredFrom=2024-02-30x&acquiredTo=2024-06-01").acquired).toEqual({ from: null, to: "2024-06-01" });
    expect(parse("acquiredFrom=1999-13-45").acquired.from).toBeNull();
    expect(parse("acquiredFrom=2024-02-30").acquired.from).toBeNull();
    expect(parse("acquiredFrom=2024-02-29").acquired.from).toBe("2024-02-29");
  });

  it("clamps fill to a percentage", () => {
    expect(parse("fillMin=-5&fillMax=250").fill).toEqual({ min: 0, max: 100 });
  });

  it("refuses a page number that is not a positive integer", () => {
    expect(parse("page=3").page).toBe(3);
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-2").page).toBe(1);
    expect(parse("page=two").page).toBe(1);
  });
});

describe("serialiseFilters", () => {
  it("writes nothing for a default view", () => {
    expect(serialiseFilters(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips every filter", () => {
    const filters: BottleFilters = {
      ...DEFAULT_FILTERS,
      q: "weller",
      categoryIds: [1, 4],
      brandIds: [2],
      distilleryIds: [3, 9],
      finishIds: [5],
      storeIds: [6],
      tagIds: [7],
      statuses: ["open", "killed"],
      open: "open",
      favorite: true,
      proof: { min: 90, max: 120 },
      age: { min: null, max: 12 },
      price: { min: 20, max: null },
      acquisitions: ["gift", "allocation"],
      acquired: { from: "2024-01-01", to: "2024-12-31" },
      fill: { min: null, max: 10 },
      caskStrength: true,
      bottledInBond: true,
      pick: true,
      overMsrp: true,
      sort: "proof",
      desc: false,
      page: 3,
      pageSize: 50,
      view: "gallery",
      hidden: ["msrp", "store"],
    };
    expect(parse(serialiseFilters(filters))).toEqual(filters);
  });

  it("keeps a bookmarked URL free of defaults", () => {
    const query = serialiseFilters({ ...DEFAULT_FILTERS, distilleryIds: [3] });
    expect(query).toBe("distillery=3");
  });
});

describe("status default", () => {
  it("shows what's on the shelf until asked for more", () => {
    expect(parse("").statuses).toEqual(["owned", "open"]);
  });

  it("spells every status as status=all and reads it back", () => {
    const query = serialiseFilters({ ...DEFAULT_FILTERS, statuses: [] });
    expect(query).toBe("status=all");
    expect(parse(query).statuses).toEqual([]);
  });

  it("treats the default in any order as the default", () => {
    const filters = { ...DEFAULT_FILTERS, statuses: ["open", "owned"] as BottleFilters["statuses"] };
    expect(serialiseFilters(filters)).toBe("");
    expect(activeFilterCount(filters)).toBe(0);
  });

  it("falls back to the default when nothing in the URL is a status", () => {
    expect(parse("status=bogus").statuses).toEqual(["owned", "open"]);
  });

  it("counts showing history as an active filter", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, statuses: [] })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, statuses: ["killed"] })).toBe(1);
  });
});

describe("activeFilterCount", () => {
  it("is zero for a default view", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it("counts a group of ids once, not per id", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, distilleryIds: [1, 2, 3] })).toBe(1);
  });

  it("counts a range once whether one end or both are set", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, proof: { min: 100, max: null } })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, proof: { min: 100, max: 120 } })).toBe(1);
  });

  it("counts each Numbers drill-down filter once", () => {
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        acquisitions: ["gift", "trade"],
        acquired: { from: "2024-01-01", to: null },
        fill: { min: null, max: 10 },
        caskStrength: true,
        overMsrp: true,
      }),
    ).toBe(5);
  });

  it("ignores sorting, paging and view mode", () => {
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, sort: "proof", desc: false, page: 4, view: "gallery" }),
    ).toBe(0);
  });
});
