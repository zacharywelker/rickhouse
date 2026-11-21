import { describe, expect, it } from "vitest";
import { DUPLICATE_KINDS, KIND_LABELS } from "../duplicate-kinds";
import { FILLER_WORDS, findMashbillPairs, findNamePairs, type NameRow } from "../pair-detection";

const rows = (a: string, b: string): NameRow[] => [{ id: 9, name: a }, { id: 3, name: b }];

describe("findNamePairs", () => {
  it("defines the nine kinds and their labels and filler lists", () => {
    expect(DUPLICATE_KINDS).toEqual(["brands", "distilleries", "companies", "finishes", "ingredients", "mashbills", "cooperages", "stores", "tags"]);
    expect(DUPLICATE_KINDS.map((kind) => KIND_LABELS[kind])).toEqual(["Brands", "Distilleries", "Companies", "Finishes", "Ingredients", "Mashbills", "Cooperages", "Stores", "Tags"]);
    for (const kind of DUPLICATE_KINDS) expect(Array.isArray(FILLER_WORDS[kind])).toBe(true);
  });

  it.each([
    ["distilleries", "Buffalo Trace", "Buffalo Trace Distillery", 1, "Same name once “Distillery” is dropped"],
    ["brands", "Maker’s Mark", "Makers Mark", 0, "Same name apart from spacing and punctuation"],
    ["distilleries", "Heaven Hill", "Heavenhill", 0, "Same name apart from spacing and punctuation"],
    ["brands", "Águila", "AGUILA", 0, "Same name apart from spacing and punctuation"],
    ["finishes", "Madeira Cask", "Maderia Cask", 2, "One letter apart"],
    ["finishes", "Port Cask", "Port Casks", 2, "Same name apart from the plural"],
    ["finishes", "Cognac Cask", "Cognac Cask Finish", 1, "Same name once “Finish” is dropped"],
    ["tags", "abcdefgh", "abcdxygh", 2, "2 letters apart"],
  ] as const)("%s: %s / %s", (kind, a, b, score, reason) => {
    expect(findNamePairs(kind, rows(a, b))).toEqual([{ aId: 3, bId: 9, score, reason }]);
    expect(findNamePairs(kind, rows(a, b).reverse())).toEqual(findNamePairs(kind, rows(a, b)));
  });

  it.each([
    ["Old Forester", "Old Forester 100"], ["Wild Turkey", "Wild Turkey Rare Breed"],
    ["Rye", "Rum"], ["Rye", "Ryes"], ["The", "The Co"], ["", "!!!"],
    ["Abcdef", "Abcxyf"], // Six letters allow only one slip, even against a longer name.
    ["Abcdef", "Abcdxyf"],
  ])("does not pair %s / %s", (a, b) => {
    expect(findNamePairs("brands", rows(a, b))).toEqual([]);
  });

  it("only drops whole filler words and never fuzzy-matches short names", () => {
    expect(findNamePairs("distilleries", rows("Rye", "Rye Distillery"))).toEqual([]);
    expect(findNamePairs("brands", rows("Rye", "RYE"))).toHaveLength(1);
    expect(findNamePairs("distilleries", rows("Coalfield", "Field"))).toEqual([]);
  });

  it("requires compatible store places", () => {
    expect(findNamePairs("stores", [{ id: 1, name: "Binny’s", place: "chicago" }, { id: 2, name: "Binnys", place: "evanston" }])).toEqual([]);
    for (const place of ["chicago", null, undefined]) {
      expect(findNamePairs("stores", [{ id: 1, name: "Binny’s", place: "chicago" }, { id: 2, name: "Binnys", place }])).toHaveLength(1);
    }
  });

  it("requires identical ingredient groups", () => {
    expect(findNamePairs("ingredients", [{ id: 1, name: "Apple", group: "flavor" }, { id: 2, name: "Apple", group: "distillate" }])).toEqual([]);
    expect(findNamePairs("ingredients", [{ id: 1, name: "Apple", group: "flavor" }, { id: 2, name: "Apple", group: "flavor" }])).toHaveLength(1);
  });

  it("orders by score, then names independent of input order, then ids; emits each pair once", () => {
    const input = [
      { id: 8, name: "Zulu" }, { id: 7, name: "ZULU" },
      { id: 6, name: "Alpha" }, { id: 5, name: "Alpha" }, { id: 4, name: "Alpha" },
      { id: 3, name: "Buffalo Trace" }, { id: 2, name: "Buffalo Trace Distillery" },
      { id: 1, name: "Buffalo Trce" },
    ];
    const pairs = findNamePairs("distilleries", input);
    expect(pairs.map(({ aId, bId, score }) => [aId, bId, score])).toEqual([
      [4, 5, 0], [4, 6, 0], [5, 6, 0], [7, 8, 0], [2, 3, 1], [1, 3, 2],
    ]);
    expect(findNamePairs("distilleries", input.reverse())).toEqual(pairs);
  });

  it("handles 2,000 synthetic names well under a second", () => {
    let seed = 20261121;
    const input = Array.from({ length: 2_000 }, (_, id) => {
      const name = Array.from({ length: 8 + id % 24 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return String.fromCharCode(97 + (seed >>> 16) % 26);
      }).join("");
      return { id, name };
    });
    const start = performance.now();
    expect(findNamePairs("brands", input)).toEqual([]);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("findMashbillPairs", () => {
  it("pairs every matching recipe once in ascending id order", () => {
    const input = [{ id: 9, key: "corn:80|rye:20" }, { id: 3, key: "corn:80|rye:20" }, { id: 6, key: "corn:80|rye:20" }, { id: 1, key: "corn:75|rye:25" }];
    expect(findMashbillPairs(input)).toEqual([
      { aId: 3, bId: 6, score: 0, reason: "Same grain recipe" },
      { aId: 3, bId: 9, score: 0, reason: "Same grain recipe" },
      { aId: 6, bId: 9, score: 0, reason: "Same grain recipe" },
    ]);
    expect(findMashbillPairs(input.reverse())).toEqual(findMashbillPairs(input));
  });
  it("handles empty and singleton input", () => {
    expect(findMashbillPairs([])).toEqual([]);
    expect(findMashbillPairs([{ id: 1, key: "corn:100" }])).toEqual([]);
  });
});
