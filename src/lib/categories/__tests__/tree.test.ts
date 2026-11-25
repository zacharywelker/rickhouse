import { describe, expect, it } from "vitest";
import { CATEGORY_TREE } from "../tree";

const children: Record<string, string[]> = {
  "american-whiskey": ["bourbon", "rye", "wheat-whiskey", "corn-whiskey", "american-single-malt", "light-whiskey", "tennessee"],
  "irish-whiskey": ["pot-still-irish-whiskey", "malt-irish-whiskey", "grain-irish-whiskey", "blended-irish-whiskey"],
  scotch: ["single-malt-scotch", "single-grain-scotch", "blended-scotch", "blended-grain-scotch", "blended-malt-scotch"],
  whiskey: ["canadian-whisky", "japanese", "international", "flavored-whisky"],
  rum: ["cachaca", "agricole", "spiced-rum"],
  agave: ["tequila", "mezcal"],
  brandy: ["cognac", "armagnac", "calvados", "pisco", "apple", "eau-de-vie"],
  gin: ["genever"],
  vodka: ["flavored-vodka"],
  amaro: [],
  liqueur: ["fruit-liqueur", "anise-liqueur", "cream-liqueur", "nut-liqueur", "herbal-liqueur", "chocolate-liqueur", "coffee-liqueur"],
  other: ["absinthe", "akvavit", "shochu"],
};

describe("CATEGORY_TREE", () => {
  it("lists every parent before its children", () => {
    const earlier = new Set<string>();
    for (const node of CATEGORY_TREE) {
      if (node.parent !== null) expect(earlier.has(node.parent), node.slug).toBe(true);
      earlier.add(node.slug);
    }
  });

  it("has unique slugs", () => {
    expect(new Set(CATEGORY_TREE.map((node) => node.slug)).size).toBe(CATEGORY_TREE.length);
  });

  it("has unique name and parent pairs", () => {
    expect(new Set(CATEGORY_TREE.map((node) => JSON.stringify([node.name, node.parent]))).size).toBe(CATEGORY_TREE.length);
  });

  it("gives every child its parent's field group", () => {
    const bySlug = new Map(CATEGORY_TREE.map((node) => [node.slug, node]));
    for (const node of CATEGORY_TREE) {
      if (node.parent !== null) expect(node.fieldGroup, node.slug).toBe(bySlug.get(node.parent)?.fieldGroup);
    }
  });

  it("has exactly the intended top-level categories in order", () => {
    expect(CATEGORY_TREE.filter((node) => node.parent === null).map((node) => [node.name, node.slug, node.fieldGroup, node.sortOrder])).toEqual([
      ["American Whiskey", "american-whiskey", "whiskey", 1],
      ["Irish Whiskey", "irish-whiskey", "whiskey", 2],
      ["Scotch Whisky", "scotch", "whiskey", 3],
      ["Whisky", "whiskey", "whiskey", 4],
      ["Rum", "rum", "rum", 5],
      ["Agave", "agave", "agave", 6],
      ["Brandy", "brandy", "brandy", 7],
      ["Gin", "gin", "gin", 8],
      ["Vodka", "vodka", "vodka", 9],
      ["Amaro", "amaro", "amaro", 10],
      ["Liqueur", "liqueur", "liqueur", 11],
      ["Other", "other", "other", 12],
    ]);
  });

  it("keeps Amaro childless", () => {
    expect(CATEGORY_TREE.filter((node) => node.parent === "amaro")).toEqual([]);
  });

  it.each(Object.entries(children))("lists the intended children of %s in order", (parent, slugs) => {
    expect(CATEGORY_TREE.filter((node) => node.parent === parent).map((node) => [node.slug, node.sortOrder])).toEqual(
      slugs.map((slug, index) => [slug, index + 1]),
    );
  });
});
