import { describe, expect, it } from "vitest";
import { DEFAULT_PER, PER_PAGE_OPTIONS, PHOTO_TABS, pageWindow, parsePhotoParams } from "@/lib/housekeeping/photo-params";

describe("photo URL parameters", () => {
  it("exports the tab order and per-page choices", () => {
    expect(PHOTO_TABS).toEqual(["labels", "barrels", "vintages"]);
    expect(PER_PAGE_OPTIONS).toEqual([8, 12, 24, 48]);
    expect(DEFAULT_PER).toBe(8);
  });

  it("defaults missing parameters and parses valid choices", () => {
    expect(parsePhotoParams({})).toEqual({ tab: "labels", per: 8, page: 1 });
    expect(parsePhotoParams({ tab: "barrels", per: "24", page: "3" })).toEqual({ tab: "barrels", per: 24, page: 3 });
    expect(parsePhotoParams({ tab: "vintages", per: "48", page: "2" })).toEqual({ tab: "vintages", per: 48, page: 2 });
    expect(parsePhotoParams({ per: "12" }).per).toBe(12);
  });

  it.each([
    { tab: "nonsense" }, { per: "7" }, { per: "abc" },
    { page: "0" }, { page: "-2" }, { page: "abc" }, { page: "2.5" },
    { page: "3junk" }, { page: "Infinity" }, { page: "9007199254740992" },
  ])("defaults invalid parameters: %j", (params) => {
    expect(parsePhotoParams(params)).toEqual({ tab: "labels", per: 8, page: 1 });
  });

  it("takes the first array entry, including invalid or empty entries", () => {
    expect(parsePhotoParams({ tab: ["barrels", "labels"], per: ["24", "8"], page: ["3", "1"] })).toEqual({ tab: "barrels", per: 24, page: 3 });
    expect(parsePhotoParams({ tab: [], per: [], page: [] })).toEqual({ tab: "labels", per: 8, page: 1 });
    expect(parsePhotoParams({ page: ["abc", "3"] }).page).toBe(1);
  });
});

describe("photo page windows", () => {
  it.each([
    [11, 8, 1, { page: 1, pages: 2, from: 1, to: 8, offset: 0 }],
    [11, 8, 2, { page: 2, pages: 2, from: 9, to: 11, offset: 8 }],
    [11, 8, 99, { page: 2, pages: 2, from: 9, to: 11, offset: 8 }],
    [11, 8, 0, { page: 1, pages: 2, from: 1, to: 8, offset: 0 }],
    [0, 8, 1, { page: 1, pages: 1, from: 0, to: 0, offset: 0 }],
    [0, 8, 99, { page: 1, pages: 1, from: 0, to: 0, offset: 0 }],
    [8, 8, 1, { page: 1, pages: 1, from: 1, to: 8, offset: 0 }],
  ])("windows total=%i per=%i page=%i", (total, per, page, expected) => {
    expect(pageWindow(total, per, page)).toEqual(expected);
  });
});
