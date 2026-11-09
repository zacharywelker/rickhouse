import type { Route } from "next";
import type { IngredientKind } from "@/db/schema";
import { isPreset, presetFor } from "./ingredient-presets";

/**
 * No value import from the schema here: ResourceView is a client component and this file rides
 * along with it. The Record type makes the compiler list any kind added to the schema later.
 */
export const INGREDIENT_KIND_LABELS: Record<IngredientKind, string> = {
  maguey: "Maguey",
  distillate: "Distillate",
  rum_base: "Rum base",
  botanical: "Botanical",
  gin_base: "Gin base",
  vodka_base: "Vodka base",
  flavor: "Flavor",
  liqueur_base: "Liqueur base",
};

export const FAMILIES = ["grape", "apple", "pear", "other"] as const;

export function isIngredientKind(value: unknown): value is IngredientKind {
  return typeof value === "string" && Object.hasOwn(INGREDIENT_KIND_LABELS, value);
}

export type Lock = { tag: "Built-in" | "Fixed"; reason: string; allowDelete: boolean };

/**
 * Why a row is locked, or null. Fixed: an amaro style adds it by name on every save, so a rename
 * would be undone and a delete or merge-away would be re-created. Built-in: the name is a preset
 * and would come straight back as a suggestion after a rename; but deleting or merging away a row
 * loses nothing, so that stays allowed (the guarded delete still stops it while a label uses it).
 * Decided from data, not a name list, so a new amaro style is covered automatically.
 */
export function lockFor(row: { kind: IngredientKind; name: string; styleLinks: number }): Lock | null {
  if (row.styleLinks > 0) {
    return { tag: "Fixed", reason: "An amaro style adds this automatically, so it can't be renamed or deleted.", allowDelete: false };
  }
  if (isPreset(row.kind, row.name)) {
    return { tag: "Built-in", reason: "This comes with the app, so it can't be renamed.", allowDelete: true };
  }
  return null;
}

export function reservedNameError(kind: IngredientKind, name: string): string | null {
  const preset = presetFor(kind, name);
  return preset ? `${preset} is a built-in choice. Pick ${preset} on the label itself instead.` : null;
}

export const ingredientHref = (item: { id: number }): Route => `/ingredients/${item.id}` as Route;
