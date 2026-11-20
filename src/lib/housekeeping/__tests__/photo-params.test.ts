import { describe, expect, it } from "vitest";
import {
  DEFAULT_PER,
  PER_PAGE_OPTIONS,
  PHOTO_TABS,
  nextOffset,
  pageWindow,
  parsePhotoParams,
  photoHref,
  previousOffset,
} from "@/lib/housekeeping/photo-params";

describe("photo URL parameters", () => {
  it("exports the tab order and per-page choices", () => {
    expect(PHOTO_TABS).toEqual(["labels", "barrels", "vintages"]);
    expect(PER_PAGE_OPTIONS).toEqual([8, 12, 24, 48]);
    expect(DEFAULT_PER).toBe(8);
  });

  it("defaults missing parameters and parses valid choices", () => {
    expect(parsePhotoParams({})).toEqual({ tab: "labels", per: 8, offset: 0 });
    expect(parsePhotoParams({ tab: "barrels", per: "24", offset: "16" })).toEqual({ tab: "barrels", per: 24, offset: 16 });
    expect(parsePhotoParams({ tab: "vintages", per: "48", offset: "5" })).toEqual({ tab: "vintages", per: 48, offset: 5 });
    expect(parsePhotoParams({ per: "12" }).per).toBe(12);
  });

  it.each([
    { tab: "nonsense" }, { per: "7" }, { per: "abc" },
    { offset: "-2" }, { offset: "abc" }, { offset: "2.5" },
    { offset: "3junk" }, { offset: "Infinity" }, { offset: "9007199254740992" },
  ])("defaults invalid parameters: %j", (params) => {
    expect(parsePhotoParams(params)).toEqual({ tab: "labels", per: 8, offset: 0 });
  });

  it("takes the first array entry, including invalid or empty entries", () => {
    expect(parsePhotoParams({ tab: ["barrels", "labels"], per: ["24", "8"], offset: ["16", "0"] })).toEqual({ tab: "barrels", per: 24, offset: 16 });
    expect(parsePhotoParams({ tab: [], per: [], offset: [] })).toEqual({ tab: "labels", per: 8, offset: 0 });
    expect(parsePhotoParams({ offset: ["abc", "3"] }).offset).toBe(0);
  });
});

describe("pageWindow", () => {
  it("shows the window starting at the offset", () => {
    expect(pageWindow(11, 8, 0)).toEqual({ offset: 0, from: 1, to: 8, hasPrev: false, hasNext: true });
    expect(pageWindow(11, 8, 8)).toEqual({ offset: 8, from: 9, to: 11, hasPrev: true, hasNext: false });
  });

  it("allows an offset that is not a multiple of the page size", () => {
    expect(pageWindow(21, 8, 5)).toEqual({ offset: 5, from: 6, to: 13, hasPrev: true, hasNext: true });
  });

  it("pulls an offset past the end back to the last full window", () => {
    expect(pageWindow(11, 8, 99)).toEqual({ offset: 3, from: 4, to: 11, hasPrev: true, hasNext: false });
    expect(pageWindow(5, 8, 40)).toEqual({ offset: 0, from: 1, to: 5, hasPrev: false, hasNext: false });
  });

  it("is empty for no rows", () => {
    expect(pageWindow(0, 8, 0)).toEqual({ offset: 0, from: 0, to: 0, hasPrev: false, hasNext: false });
    expect(pageWindow(0, 8, 16)).toEqual({ offset: 0, from: 0, to: 0, hasPrev: false, hasNext: false });
  });

  it("has no next window when the rows end exactly at the window", () => {
    expect(pageWindow(8, 8, 0).hasNext).toBe(false);
  });
});

describe("moving between windows", () => {
  it("goes forward by a page", () => {
    expect(nextOffset(0, 8, 0)).toBe(8);
    expect(nextOffset(8, 8, 0)).toBe(16);
  });

  it("goes forward by the page minus the cards saved on it, because saved rows leave the list", () => {
    expect(nextOffset(0, 8, 3)).toBe(5);
    expect(nextOffset(0, 8, 8)).toBe(0);
    expect(nextOffset(8, 8, 8)).toBe(8);
  });

  it("never goes backward on saves, even if more were saved than the page holds", () => {
    expect(nextOffset(4, 8, 20)).toBe(4);
  });

  it("goes back by a page and stops at the start", () => {
    expect(previousOffset(16, 8)).toBe(8);
    expect(previousOffset(5, 8)).toBe(0);
    expect(previousOffset(0, 8)).toBe(0);
  });
});

describe("photoHref", () => {
  it("keeps the tab and page size and leaves the offset out at the start", () => {
    expect(photoHref("labels", 8, 0)).toBe("/housekeeping?tab=labels&per=8");
    expect(photoHref("barrels", 24, 5)).toBe("/housekeeping?tab=barrels&per=24&offset=5");
  });
});
