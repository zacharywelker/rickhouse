import type { FieldGroup } from "@/db/schema";

/**
 * Category color identifies the spirit family (DESIGN.md §4.3) — it is an
 * accent alongside the text, never the only cue (§4.3 accessibility
 * requirement), and it keys off the category's field group (whiskey, rum,
 * agave…) rather than its display name, so "Bourbon", "Rye" and "Scotch"
 * all read as the same family.
 */
const CATEGORY_COLOR: Record<FieldGroup, string> = {
  whiskey: "bg-category-whiskey",
  rum: "bg-category-rum",
  agave: "bg-category-agave",
  brandy: "bg-category-brandy",
  gin: "bg-category-gin",
  vodka: "bg-category-vodka",
  liqueur: "bg-category-liqueur",
  other: "bg-category-other",
};

export function categorySwatchClass(fieldGroup: FieldGroup): string {
  return CATEGORY_COLOR[fieldGroup];
}
