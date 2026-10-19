import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_FILTERS, parseFieldFilters, searchWords } from "../field-filters";

describe("parseFieldFilters", () => {
  it("gives the defaults for nothing, junk or a non-object", () => {
    for (const raw of [undefined, null, 5, "x", [], {}]) expect(parseFieldFilters(raw)).toEqual(DEFAULT_FIELD_FILTERS);
  });

  it("defaults to what is on the shelf", () => {
    expect(parseFieldFilters({}).statuses).toEqual(["owned", "open"]);
  });

  it("does not share the default list between calls", () => {
    parseFieldFilters({}).statuses.push("sold");
    expect(parseFieldFilters({}).statuses).toEqual(["owned", "open"]);
  });

  it("reads every field", () => {
    expect(parseFieldFilters({ q: "  old  forester ", categoryIds: [3, 4], statuses: ["owned", "killed"], opened: "sealed", tasted: "untasted" })).toEqual({
      q: "old forester",
      categoryIds: [3, 4],
      statuses: ["owned", "killed"],
      opened: "sealed",
      tasted: "untasted",
    });
  });

  it("accepts comma-separated lists like a URL", () => {
    expect(parseFieldFilters({ categoryIds: "3, 4,x,4", statuses: "open,sold" })).toMatchObject({ categoryIds: [3, 4], statuses: ["open", "sold"] });
  });

  it("drops junk ids and statuses, keeping the rest", () => {
    expect(parseFieldFilters({ categoryIds: [1, -2, 0, 1.5, "7", "x", null, 1], statuses: ["owned", "nope", 4] })).toMatchObject({ categoryIds: [1, 7], statuses: ["owned"] });
  });

  it("falls back to the default statuses when none are recognised, and to every status when asked for all or an empty list", () => {
    expect(parseFieldFilters({ statuses: ["nope"] }).statuses).toEqual(["owned", "open"]);
    expect(parseFieldFilters({ statuses: [] }).statuses).toEqual([]);
    expect(parseFieldFilters({ statuses: "all" }).statuses).toEqual([]);
  });

  it("bounds the lengths", () => {
    expect(parseFieldFilters({ q: "x".repeat(500) }).q).toHaveLength(80);
    expect(parseFieldFilters({ categoryIds: Array.from({ length: 200 }, (_, i) => i + 1) }).categoryIds).toHaveLength(50);
  });

  it("ignores a q that is not text", () => {
    expect(parseFieldFilters({ q: 5 }).q).toBe("");
    expect(parseFieldFilters({ q: ["a"] }).q).toBe("");
  });

  it("ignores unknown enum values and unknown keys", () => {
    expect(parseFieldFilters({ opened: "yes", tasted: 1, extra: true })).toEqual(DEFAULT_FIELD_FILTERS);
  });
});

describe("searchWords", () => {
  it("splits on spaces and skips empties", () => {
    expect(searchWords("old forester")).toEqual(["old", "forester"]);
    expect(searchWords("")).toEqual([]);
  });
});
