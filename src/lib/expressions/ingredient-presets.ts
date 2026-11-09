import type { IngredientKind } from "@/db/schema";

/**
 * The names the web label forms offer before anyone has typed one. They are constants, not rows:
 * a row appears only when a label uses the name or someone adds it in Configuration. The iOS copy
 * lives in SpiritChoices.swift and is not kept in step by this module.
 */
export const GIN_BASES = ["Corn", "Potato", "Rye", "Grape", "Molasses", "Sugarcane", "Apple", "Wheat", "Barley", "Whey"] as const;
export const GIN_BOTANICALS = [
  "Juniper", "Coriander", "Angelica Root", "Cassia Bark", "Lemon", "Bitter Orange", "Lime", "Yuzu",
  "Grapefruit", "Pomelo", "Cardamom", "Cucumber", "Lavender", "Allspice", "Almond", "Bergamot",
  "Anise", "Basil", "Bay Laurel", "Black Pepper", "Blood Orange", "Butterfly Pea Flower",
  "Hibiscus", "Chamomile", "Cloves", "Cubeb Pepper", "Dill", "Elderflower", "Elderberry",
  "Fennel", "Ginger", "Grains of Paradise", "Honeysuckle", "Lemongrass", "Licorice",
  "Meadowsweet", "Nutmeg", "Orris Root", "Rosemary", "Rose", "Thyme",
] as const;
export const RUM_BASES = ["Molasses", "Sugarcane", "Honey"] as const;
export const VODKA_BASES = ["Wheat", "Rye", "Potato", "Corn", "Grape"] as const;
export const MAGUEY_PRESETS = ["Blue Weber"] as const;

export type FruitFamily = "grape" | "apple" | "pear" | "other";
/**
 * Base fruits offered while typing a brandy's distillate, each with the family the category rules
 * check (Cognac and Armagnac are grape, Calvados apple or pear). Not exhaustive: anything else typed
 * is accepted and gets a family from `fruitFamily`.
 */
export const BRANDY_FRUITS: Readonly<Record<string, FruitFamily>> = {
  "Ugni Blanc": "grape", "Folle Blanche": "grape", "Colombard": "grape", "Baco Blanc": "grape", "Montils": "grape",
  "Muscat": "grape", "Palomino": "grape", "Quebranta": "grape", "Italia": "grape", "Torrontel": "grape", "Grape": "grape", "Grape Pomace": "grape",
  "Apple": "apple", "Cider Apple": "apple",
  "Pear": "pear", "Williams Pear": "pear",
  "Apricot": "other", "Cherry": "other", "Plum": "other", "Peach": "other", "Raspberry": "other", "Blackberry": "other", "Quince": "other", "Fig": "other",
};

/**
 * Fruits whose name reads as another fruit's. Checked ahead of the category default and the name
 * match, so Pineapple is never an apple, Grapefruit never a grape, and Crabapple still an apple.
 */
export const FRUIT_FAMILY_EXCEPTIONS: Readonly<Record<string, FruitFamily>> = {
  "Pineapple": "other", "Grapefruit": "other", "Prickly Pear": "other", "Pineapple Guava": "other",
  "Crabapple": "apple",
};

const familyOf = (table: Readonly<Record<string, FruitFamily>>, wanted: string): FruitFamily | null =>
  Object.entries(table).find(([fruit]) => fruit.toLocaleLowerCase() === wanted)?.[1] ?? null;

/** The family of a base fruit: a listed fruit keeps its own, an unlisted one follows the category, else "other". */
export function fruitFamily(categoryKind: string | null, name: string): FruitFamily {
  const wanted = name.trim().toLocaleLowerCase();
  const listed = familyOf(BRANDY_FRUITS, wanted) ?? familyOf(FRUIT_FAMILY_EXCEPTIONS, wanted);
  if (listed) return listed;
  if (categoryKind === "cognac" || categoryKind === "armagnac") return "grape";
  if (categoryKind === "calvados") return /\b(pears?|poire)\b/.test(wanted) ? "pear" : "apple";
  // Whole words only, and the named fruit before the pressing: "Apple Pomace" is an apple.
  if (/\b(pears?|poire)\b/.test(wanted)) return "pear";
  if (/\b(apples?|cider)\b/.test(wanted)) return "apple";
  if (/\b(grapes?|pomace|marc)\b/.test(wanted)) return "grape";
  return "other";
}

export const INGREDIENT_PRESETS: Partial<Record<IngredientKind, readonly string[]>> = {
  maguey: MAGUEY_PRESETS,
  rum_base: RUM_BASES,
  gin_base: GIN_BASES,
  botanical: GIN_BOTANICALS,
  vodka_base: VODKA_BASES,
};

/** The canonical spelling of the preset this name matches for this kind, or null. */
export function presetFor(kind: IngredientKind, name: string): string | null {
  const wanted = name.trim().toLocaleLowerCase();
  return INGREDIENT_PRESETS[kind]?.find((preset) => preset.toLocaleLowerCase() === wanted) ?? null;
}

export const isPreset = (kind: IngredientKind, name: string): boolean => presetFor(kind, name) !== null;
