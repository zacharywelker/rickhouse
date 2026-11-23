import { describe, expect, it } from "vitest";
import { pageHref, parsePageState, type PageState } from "@/lib/housekeeping/page-state";

const defaults: PageState = { tab: "labels", per: 8, offset: 0, dup: null, ttbOffset: 0, ttbPer: 8 };
const full: PageState = { tab: "barrels", per: 12, offset: 5, dup: "stores", ttbOffset: 16, ttbPer: 24 };
const fullParams = { tab: "barrels", per: "12", offset: "5", dup: "stores", to: "16", tp: "24" };

function addressParams(href: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(href.split("?")[1]));
}

describe("parsePageState", () => {
  it("defaults missing parameters", () => {
    expect(parsePageState({})).toEqual(defaults);
  });

  it("parses a fully set address", () => {
    expect(parsePageState(addressParams("/housekeeping?tab=barrels&per=12&offset=5&dup=stores&to=16&tp=24"))).toEqual(full);
  });

  it.each<[string, string, Partial<PageState>]>([
    ["to", "-1", { ttbOffset: 0 }],
    ["to", "abc", { ttbOffset: 0 }],
    ["to", "2.5", { ttbOffset: 0 }],
    ["to", "9007199254740992", { ttbOffset: 0 }],
    ["to", "Infinity", { ttbOffset: 0 }],
    ["to", "3junk", { ttbOffset: 0 }],
    ["tp", "7", { ttbPer: 8 }],
    ["tp", "abc", { ttbPer: 8 }],
    ["dup", "categories", { dup: null }],
    ["tab", "nonsense", { tab: "labels" }],
    ["per", "7", { per: 8 }],
    ["offset", "-2", { offset: 0 }],
  ])("defaults invalid %s=%s without changing other fields", (key, value, fallback) => {
    expect(parsePageState({ ...fullParams, [key]: value })).toEqual({ ...full, ...fallback });
  });

  it("takes the first array entry for every parameter", () => {
    expect(parsePageState({
      tab: ["barrels", "labels"], per: ["12", "8"], offset: ["5", "0"],
      dup: ["stores", "brands"], to: ["16", "0"], tp: ["24", "8"],
    })).toEqual(full);
  });

  it("defaults invalid first entries and empty arrays without using later entries", () => {
    expect(parsePageState({
      tab: ["nonsense", "barrels"], per: ["7", "12"], offset: ["-2", "5"],
      dup: ["categories", "stores"], to: ["abc", "16"], tp: ["7", "24"],
    })).toEqual(defaults);
    expect(parsePageState({ tab: [], per: [], offset: [], dup: [], to: [], tp: [] })).toEqual(defaults);
  });

  it.each([8, 12, 24, 48] as const)("accepts TTB page size %i", (ttbPer) => {
    expect(parsePageState({ ...fullParams, tp: String(ttbPer) })).toEqual({ ...full, ttbPer });
  });

  it("accepts the largest safe offset without clamping to an unknown total", () => {
    expect(parsePageState({ ...fullParams, to: String(Number.MAX_SAFE_INTEGER) })).toEqual({ ...full, ttbOffset: Number.MAX_SAFE_INTEGER });
  });
});

describe("pageHref", () => {
  it("always includes tab and per, omits default optional fields, and keeps parameter order", () => {
    expect(pageHref(defaults)).toBe("/housekeeping?tab=labels&per=8");
    expect(pageHref(full)).toBe("/housekeeping?tab=barrels&per=12&offset=5&dup=stores&to=16&tp=24");
    expect(pageHref({ ...full, offset: 0, dup: null, ttbOffset: 0, ttbPer: 8 })).toBe("/housekeeping?tab=barrels&per=12");
  });

  it.each<[PageState, string]>([
    [defaults, "/housekeeping?tab=labels&per=8"],
    [{ ...defaults, tab: "barrels", per: 24, offset: 5, dup: "stores" }, "/housekeeping?tab=barrels&per=24&offset=5&dup=stores"],
    [{ ...defaults, dup: "brands" }, "/housekeeping?tab=labels&per=8&dup=brands"],
    [{ ...defaults, tab: "vintages", per: 48, offset: 9 }, "/housekeeping?tab=vintages&per=48&offset=9"],
  ])("keeps the addresses the Photos and Duplicates sections already used: %j", (state, expected) => {
    expect(pageHref(state)).toBe(expected);
  });

  it("changes only patched fields and does not mutate either input", () => {
    const state = Object.freeze({ ...full });
    const patch = Object.freeze({ tab: "vintages" as const, offset: 0 });
    expect(pageHref(state, patch)).toBe("/housekeeping?tab=vintages&per=12&dup=stores&to=16&tp=24");
    expect(state).toEqual(full);
    expect(patch).toEqual({ tab: "vintages", offset: 0 });
  });

  it.each<[string, Partial<PageState>]>([
    ["Photos tab", { tab: "vintages" }],
    ["Photos page size", { per: 48 }],
    ["Photos offset", { offset: 0 }],
    ["Duplicates kind", { dup: "tags" }],
    ["Duplicates cleared", { dup: null }],
    ["TTB offset", { ttbOffset: 0 }],
    ["TTB page size", { ttbPer: 8 }],
  ])("patching %s preserves every other section's values in the address", (_section, patch) => {
    expect(parsePageState(addressParams(pageHref(full, patch)))).toEqual({ ...full, ...patch });
  });

  it.each<PageState>([
    defaults,
    full,
    { ...defaults, tab: "vintages", per: 48, ttbPer: 12, ttbOffset: 7 },
    { ...defaults, dup: "brands", offset: 9, ttbOffset: Number.MAX_SAFE_INTEGER, ttbPer: 48 },
    { ...full, dup: null, offset: 0, ttbOffset: 0, ttbPer: 8 },
  ])("round-trips a state through its address: %j", (state) => {
    expect(parsePageState(addressParams(pageHref(state)))).toEqual(state);
  });
});
