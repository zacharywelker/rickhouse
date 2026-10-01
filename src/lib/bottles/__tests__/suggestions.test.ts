import { describe, expect, it } from "vitest";
import { NO_SUGGESTIONS, rankSuggestions, withEntered } from "../suggestions";

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

describe("withEntered", () => {
  it("offers what was just typed on the next bottle, once", () => {
    const after = withEntered({ ...NO_SUGGESTIONS, pickedBy: ["Total Wine"] }, { pickedBy: "Seelbach's", warehouse: "" });
    expect(after.pickedBy).toEqual(["Seelbach's", "Total Wine"]);
    expect(after.warehouse).toEqual([]);
    expect(withEntered(after, { pickedBy: "seelbachs" }).pickedBy).toEqual(["Seelbach's", "Total Wine"]);
  });
});
