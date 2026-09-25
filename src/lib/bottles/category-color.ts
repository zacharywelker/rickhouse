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

/** A faint category-tinted wash — for backdrops, never for text-on-text contrast. */
const CATEGORY_TINT: Record<FieldGroup, string> = {
  whiskey: "bg-category-whiskey/10",
  rum: "bg-category-rum/10",
  agave: "bg-category-agave/10",
  brandy: "bg-category-brandy/10",
  gin: "bg-category-gin/10",
  vodka: "bg-category-vodka/10",
  liqueur: "bg-category-liqueur/10",
  other: "bg-category-other/10",
};

export function categoryTintClass(fieldGroup: FieldGroup): string {
  return CATEGORY_TINT[fieldGroup];
}

/** A stronger category wash for a backdrop that should read as that color, not just hint at it. */
const CATEGORY_BACKDROP: Record<FieldGroup, string> = {
  whiskey: "bg-category-whiskey/25",
  rum: "bg-category-rum/25",
  agave: "bg-category-agave/25",
  brandy: "bg-category-brandy/25",
  gin: "bg-category-gin/25",
  vodka: "bg-category-vodka/25",
  liqueur: "bg-category-liqueur/25",
  other: "bg-category-other/25",
};

export function categoryBackdropClass(fieldGroup: FieldGroup): string {
  return CATEGORY_BACKDROP[fieldGroup];
}

const CATEGORY_TEXT: Record<FieldGroup, string> = {
  whiskey: "text-category-whiskey",
  rum: "text-category-rum",
  agave: "text-category-agave",
  brandy: "text-category-brandy",
  gin: "text-category-gin",
  vodka: "text-category-vodka",
  liqueur: "text-category-liqueur",
  other: "text-category-other",
};

export function categoryTextClass(fieldGroup: FieldGroup): string {
  return CATEGORY_TEXT[fieldGroup];
}

/** The raw custom property, for chart fills that can't take a Tailwind class. */
const CATEGORY_VAR: Record<FieldGroup, string> = {
  whiskey: "var(--category-whiskey)",
  rum: "var(--category-rum)",
  agave: "var(--category-agave)",
  brandy: "var(--category-brandy)",
  gin: "var(--category-gin)",
  vodka: "var(--category-vodka)",
  liqueur: "var(--category-liqueur)",
  other: "var(--category-other)",
};

export function categoryColorVar(fieldGroup: FieldGroup): string {
  return CATEGORY_VAR[fieldGroup];
}
