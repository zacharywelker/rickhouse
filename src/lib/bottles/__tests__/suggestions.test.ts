import { describe, expect, it } from "vitest";
import { NO_SUGGESTIONS, isTitleCased, rankSuggestions, withEntered } from "../suggestions";

describe("rankSuggestions", () => {
  it("puts the most used first", () => {
    expect(
      rankSuggestions([
        { value: "Total Wine", count: 1 },
        { value: "Seelbach's", count: 4 },
        { value: "Bourbon Society", count: 2 },
      ]),
    ).toEqual(["Seelbach's", "Bourbon Society", "Total Wine"]);
  });

  it("folds spellings that differ only in case or punctuation into the most used one", () => {
    expect(
      rankSuggestions([
        { value: "Seelbach's", count: 3 },
        { value: "seelbachs", count: 1 },
        { value: "SEELBACH'S ", count: 1 },
        { value: "Total Wine", count: 4 },
      ]),
    ).toEqual(["Seelbach's", "Total Wine"]);
  });

  it("adds extras after past values, without repeating one", () => {
    expect(rankSuggestions([{ value: "Seelbach's", count: 2 }], ["Seelbachs", "Total Wine"])).toEqual([
      "Seelbach's",
      "Total Wine",
    ]);
  });

  it("drops blanks and keeps to the limit", () => {
    expect(rankSuggestions([{ value: "  ", count: 9 }, { value: "A", count: 1 }, { value: "B", count: 1 }], [], 1)).toEqual([
      "A",
    ]);
  });
});

describe("rankSuggestions, & and Title Case", () => {
  it("reads & and and as the same", () => {
    expect(
      rankSuggestions([
        { value: "Total Wine & More", count: 2 },
        { value: "Total Wine and More", count: 1 },
        { value: "total wine & more", count: 1 },
      ]),
    ).toEqual(["Total Wine & More"]);
    // Without spaces too: "K&L" and "K and L" are one.
    expect(rankSuggestions([{ value: "K&L", count: 1 }, { value: "K and L", count: 1 }])).toHaveLength(1);
  });

  it("shows the Title Cased spelling even when another is used more", () => {
    expect(
      rankSuggestions([
        { value: "seelbachs", count: 5 },
        { value: "SEELBACH'S", count: 3 },
        { value: "Seelbach's", count: 1 },
      ]),
    ).toEqual(["Seelbach's"]);
  });

  it("falls back to the most used when no spelling is Title Cased", () => {
    expect(
      rankSuggestions([
        { value: "seelbachs", count: 1 },
        { value: "SEELBACHS", count: 2 },
      ]),
    ).toEqual(["SEELBACHS"]);
  });

  it("among Title Cased spellings, keeps the most used", () => {
    expect(
      rankSuggestions([
        { value: "Total Wine and More", count: 1 },
        { value: "Total Wine & More", count: 3 },
        { value: "total wine and more", count: 9 },
      ]),
    ).toEqual(["Total Wine & More"]);
  });

  it("lets a store's tidy name be the spelling for past entries that match it", () => {
    expect(rankSuggestions([{ value: "seelbachs", count: 3 }], ["Seelbach's"])).toEqual(["Seelbach's"]);
  });

  it("still ranks the groups themselves by use", () => {
    expect(
      rankSuggestions([
        { value: "bourbon society", count: 4 },
        { value: "Seelbach's", count: 2 },
      ]),
    ).toEqual(["bourbon society", "Seelbach's"]);
  });
});

describe("isTitleCased", () => {
  it.each([
    ["Seelbach's", true],
    ["Total Wine and More", true],
    ["Total Wine & More", true],
    ["5th Floor, Rick 12", true],
    ["Warehouse H", true],
    ["BBC Barrel Room", true],
    ["K&L Wines", true],
    ["McKenna", true],
    ["seelbachs", false],
    ["SEELBACH'S", false],
    ["5th floor, rick 12", false],
    ["and More", false],
    ["1920", false],
  ])("%s → %s", (value, expected) => {
    expect(isTitleCased(value)).toBe(expected);
  });
});

describe("withEntered", () => {
  it("swaps in a Title Cased spelling typed mid-haul", () => {
    const after = withEntered({ ...NO_SUGGESTIONS, pickedBy: ["seelbachs", "Total Wine"] }, { pickedBy: "Seelbach's" });
    expect(after.pickedBy).toEqual(["Seelbach's", "Total Wine"]);
    expect(withEntered(after, { pickedBy: "SEELBACHS" }).pickedBy).toEqual(["Seelbach's", "Total Wine"]);
  });

  it("offers what was just typed on the next bottle, once", () => {
    const after = withEntered({ ...NO_SUGGESTIONS, pickedBy: ["Total Wine"] }, { pickedBy: "Seelbach's", warehouse: "" });
    expect(after.pickedBy).toEqual(["Seelbach's", "Total Wine"]);
    expect(after.warehouse).toEqual([]);
    expect(withEntered(after, { pickedBy: "seelbachs" }).pickedBy).toEqual(["Seelbach's", "Total Wine"]);
  });
});
