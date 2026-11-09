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

/** The family of a base fruit: a listed fruit keeps its own, an unlisted one follows the category, else "other". */
export function fruitFamily(categoryKind: string | null, name: string): FruitFamily {
  const wanted = name.trim().toLocaleLowerCase();
  const listed = Object.entries(BRANDY_FRUITS).find(([fruit]) => fruit.toLocaleLowerCase() === wanted);
  if (listed) return listed[1];
  if (categoryKind === "cognac" || categoryKind === "armagnac") return "grape";
  if (categoryKind === "calvados") return /pear|poire/i.test(wanted) ? "pear" : "apple";
  return /grape|pomace|marc/i.test(wanted) ? "grape" : /pear|poire/i.test(wanted) ? "pear" : /apple|cider/i.test(wanted) ? "apple" : "other";
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
