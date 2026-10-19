import { describe, expect, it } from "vitest";
import { pluralizeCategory } from "../pluralize-category";

describe("pluralizeCategory", () => {
  // Every category the app ships (schema.sql, scripts/seed.ts, migration 0038), then names an owner may add.
  const plural: [string, string][] = [
    ["Whiskey", "whiskeys"],
    ["Rum", "rums"],
    ["Agave", "agaves"],
    ["Brandy", "brandies"],
    ["Gin", "gins"],
    ["Vodka", "vodkas"],
    ["American Whiskey", "american whiskeys"],
    ["Scotch", "scotches"],
    ["Irish Whiskey", "irish whiskeys"],
    ["Single Malt Scotch", "single malt scotches"],
    ["Blended Scotch", "blended scotches"],
    ["Bourbon", "bourbons"],
    ["Rye", "ryes"],
    ["Wheat Whiskey", "wheat whiskeys"],
    ["Single Malt", "single malts"],
    ["Light Whiskey", "light whiskeys"],
    // owner-made names
    ["Japanese Whisky", "japanese whiskies"],
    ["Canadian Whisky", "canadian whiskies"],
    ["Cognac", "cognacs"],
    ["Mezcal", "mezcals"],
    ["Tequila", "tequilas"],
    ["Liqueur", "liqueurs"],
    ["Amaro", "amaros"],
    ["Cachaça", "cachaças"],
    ["Single-Malt", "single-malts"],
    ["Whiskey (Other)", "whiskeys (other)"],
    ["Brandy (Fruit)", "brandies (fruit)"],
    ["Bourbon / Tennessee", "bourbons / tennessees"],
    ["Liqueur & Cordial", "liqueurs & cordials"],
    ["Spirits", "spirits"],
    ["Other", "other"],
    ["  Rye   Whiskey ", "rye whiskeys"],
  ];
  it.each(plural)("%s -> %s", (name, expected) => {
    expect(pluralizeCategory(name, 12)).toBe(expected);
    expect(pluralizeCategory(name, 2)).toBe(expected);
  });
  it("keeps the singular, lowercased, for a count of one", () => {
    expect(pluralizeCategory("Bourbon", 1)).toBe("bourbon");
    expect(pluralizeCategory("Japanese Whisky", 1)).toBe("japanese whisky");
    expect(pluralizeCategory("Whiskey (Other)", 1)).toBe("whiskey (other)");
  });
});
