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
