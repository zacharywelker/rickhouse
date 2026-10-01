/**
 * Mashbill display. Pure — no database, no React.
 */

export type Grain = { grain: string; percent: string | number; position?: number };

/**
 * The order a whiskey person writes grains in, whatever the percentages.
 * A mashbill published as "78/10/12" means corn, rye, malted barley — even
 * though the barley is the larger of the last two.
 */
const CANONICAL = [
  "corn",
  "rye",
  "wheat",
  "malted barley",
  "malted rye",
  "malted wheat",
  "barley",
];

const canonicalIndex = (grain: string) => {
  const found = CANONICAL.indexOf(grain.trim().toLowerCase());
  return found === -1 ? CANONICAL.length : found;
};

/**
 * Grain order follows the spirit (SPEC M7): a bourbon reads corn, rye, wheat,
 * malted barley; a rye reads rye, corn, wheat, malted barley.
 *
 * Done by putting the dominant grain first and then following the conventional
 * order, rather than by looking up the spirit type — because the dominant
 * grain *is* what makes it that spirit (bourbon is ≥51% corn, rye whiskey
 * ≥51% rye), and a mashbill is shared across labels so it has no single spirit
 * type to look up anyway.
 *
 * Sorting by percentage alone would be wrong: it reads 78/10/12 as corn,
 * malted barley, rye, which is not how anyone writes that recipe. Grains
 * outside the convention (oats, triticale) sort last, biggest first.
 */
export function orderGrains<T extends Grain>(grains: readonly T[]): T[] {
  const rest = [...grains];

  // The dominant grain leads. Ties fall to the conventional order.
  let dominant: T | undefined;
  for (const grain of rest) {
    if (
      dominant === undefined ||
      Number(grain.percent) > Number(dominant.percent) ||
      (Number(grain.percent) === Number(dominant.percent) &&
        canonicalIndex(grain.grain) < canonicalIndex(dominant.grain))
    ) {
      dominant = grain;
    }
  }
  if (dominant === undefined) return [];

  const others = rest.filter((g) => g !== dominant);
  others.sort((a, b) => {
    const byConvention = canonicalIndex(a.grain) - canonicalIndex(b.grain);
    if (byConvention !== 0) return byConvention;
    const byPercent = Number(b.percent) - Number(a.percent);
    if (byPercent !== 0) return byPercent;
    return a.grain.localeCompare(b.grain);
  });
  return [dominant, ...others];
}

/** "70% Corn · 16% Wheat · 14% Malted Barley" */
export function describeMashbill(grains: readonly Grain[]): string {
  return orderGrains(grains)
    .map((g) => `${Number(Number(g.percent).toFixed(2))}% ${g.grain}`)
    .join(" · ");
}

/**
 * What a mashbill is called. The recipe, unless the distillery keeps it secret:
 * then the recipe is only inferred, and the reference name ("Buffalo Trace
 * Wheated") stands in for it.
 */
export function mashbillTitle(mashbill: { isSecret: boolean; name: string | null }, recipe: string): string {
  const reference = mashbill.name?.trim();
  return mashbill.isSecret && reference ? reference : recipe;
}

/** What the sum has to land on, matching the database trigger. */
export const GRAIN_TOTAL = { min: 99, max: 101, exact: 100 } as const;

export function sumGrains(grains: readonly Grain[]): number {
  return grains.reduce((total, g) => {
    const parsed = Number(g.percent);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

/**
 * Offered in the picker, in the order a whiskey person would reach for them.
 * Not a closed set — the point of the child table is that anything can be
 * typed, so this is a convenience, never a validation list.
 */
export const COMMON_GRAINS = [
  "Corn",
  "Rye",
  "Wheat",
  "Malted Barley",
  "Sugarcane",
  "Molasses",
  "Agave",
  "Malted Rye",
  "Malted Wheat",
  "Oats",
  "Triticale",
  "Spelt",
  "Barley",
  "Millet",
  "Quinoa",
  "Buckwheat",
  "Sorghum",
  "Brown Rice",
] as const;

/**
 * The colour each common ingredient is drawn in, so the total bar and the rows
 * of a recipe read the same everywhere. Anything not listed gets a steady
 * colour of its own from its name.
 */
const INGREDIENT_COLORS: Readonly<Record<string, string>> = {
  corn: "#e8b02e",
  rye: "#a8432c",
  wheat: "#c9b48a",
  "malted barley": "#6b4a2b",
  sugarcane: "#6fa85b",
  molasses: "#3b2a25",
  agave: "#4f9da6",
};

export function ingredientColor(ingredient: string): string {
  const key = ingredient.trim().toLowerCase();
  const known = INGREDIENT_COLORS[key];
  if (known) return known;
  if (key === "") return "#9ca3af";
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 35% 52%)`;
}

/**
 * What a category asks of its mashbills. `hidden` means the label takes none —
 * either the spirit has no grain bill (rum, agave, brandy) or the category
 * fixes it (a single malt is 100% malted barley). `minimum` means the linked
 * mashbills must each be at least `percent` of `grain` (the legal definition).
 */
export type MashbillRule =
  | { kind: "free" }
  | { kind: "hidden" }
  | { kind: "minimum"; grain: string; percent: number };

const NO_GRAIN_BILL = new Set(["rum", "agave", "brandy"]);

const MINIMUMS: Record<string, { grain: string; percent: number }> = {
  bourbon: { grain: "corn", percent: 51 },
  rye: { grain: "corn", percent: 51 },
  "wheat-whiskey": { grain: "wheat", percent: 51 },
};

export function mashbillRuleFor(slug: string, fieldGroup: string): MashbillRule {
  if (NO_GRAIN_BILL.has(fieldGroup) || slug.includes("single-malt")) return { kind: "hidden" };
  const minimum = MINIMUMS[slug];
  return minimum ? { kind: "minimum", ...minimum } : { kind: "free" };
}

/** Whether a recipe satisfies a rule. Pass the grains as stored; names compare case-insensitively. */
export function meetsMashbillRule(rule: MashbillRule, grains: readonly Grain[]): boolean {
  if (rule.kind === "hidden") return false;
  if (rule.kind === "free") return true;
  const total = grains
    .filter((g) => g.grain.trim().toLowerCase() === rule.grain)
    .reduce((sum, g) => sum + Number(g.percent), 0);
  return total >= rule.percent;
}
