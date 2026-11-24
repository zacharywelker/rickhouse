import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/bottles/filters";
import { smartGroupQuery } from "../smart";
import { currentGroup, groupHref, RAIL_MIN_WIDTH, railInitiallyOpen, type RailGroup } from "../rail";

const handPicked: RailGroup = { id: 7, name: "Favorites", filterQuery: null };
const filters = { ...DEFAULT_FILTERS, pick: true };
const smart: RailGroup = { id: 8, name: "Picks", filterQuery: smartGroupQuery(filters) };

describe("groupHref", () => {
  it("links a smart group to its Collection query", () => {
    expect(groupHref({ ...smart, filterQuery: "pick=1&store=3" })).toBe("/bottles?pick=1&store=3");
  });

  it("links a hand-picked group by id", () => {
    expect(groupHref(handPicked)).toBe("/bottles?group=7");
  });

  it("links an empty-query smart group to all bottles", () => {
    expect(groupHref({ ...smart, filterQuery: "" })).toBe("/bottles");
  });
});

describe("currentGroup", () => {
  it("finds the hand-picked group with the current id", () => {
    expect(currentGroup({ ...DEFAULT_FILTERS, groupId: 7 }, [smart, handPicked])).toBe(handPicked);
    expect(currentGroup({ ...DEFAULT_FILTERS, groupId: 8 }, [smart])).toBeNull();
  });

  it("finds a smart group by its filter query", () => {
    expect(currentGroup(filters, [handPicked, smart])).toBe(smart);
  });

  it("returns null when no group matches", () => {
    expect(currentGroup({ ...DEFAULT_FILTERS, favorite: true }, [handPicked, smart])).toBeNull();
  });

  it("keeps default filters on all bottles even with an empty-query smart group", () => {
    expect(currentGroup(DEFAULT_FILTERS, [handPicked, { ...smart, filterQuery: "" }])).toBeNull();
  });

  it("returns only the first matching group when different ids share a query", () => {
    const second = { ...smart, id: 9 };
    expect(currentGroup(filters, [smart, second])).toBe(smart);
    expect(currentGroup(filters, [second, smart])).toBe(second);
    expect(currentGroup({ ...DEFAULT_FILTERS, groupId: 7 }, [handPicked, { ...handPicked, id: 9 }])).toBe(handPicked);
  });
});

describe("railInitiallyOpen", () => {
  it("uses a 1100px minimum width", () => {
    expect(RAIL_MIN_WIDTH).toBe(1100);
  });

  it.each([
    [900, "nonsense", false],
    [900, "open", true],
    [1400, "closed", false],
    [1100, null, true],
    [1099, null, false],
    [900, "", false],
    [1400, "nonsense", true],
  ])("at width %i with stored %s returns %s", (width, stored, expected) => {
    expect(railInitiallyOpen(width, stored)).toBe(expected);
  });
});
