/**
 * Mashbill display. Pure — no database, no React.
 */

import type { Problem } from "@/lib/admin/popup-problems";

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
 * Wheated") stands in for it. A generic mashbill ("High Rye") is a style with
 * no recipe at all, so its name is all there is.
 */
export function mashbillTitle(
  mashbill: { isSecret: boolean; isGeneric?: boolean; name: string | null },
  recipe: string,
): string {
  const reference = mashbill.name?.trim();
  return (mashbill.isSecret || mashbill.isGeneric) && reference ? reference : recipe;
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
 * How a grain is written. A common one takes its usual spelling whatever the
 * case it was typed in ("MALTED barley" is Malted Barley); anything else typed
 * all in lowercase is title-cased ("blue corn" is Blue Corn). Mixed case is
 * left alone, since someone chose it.
 */
export function normalizeGrainName(name: string): string {
  const tidy = name.trim().replace(/\s+/g, " ");
  const common = COMMON_GRAINS.find((g) => g.toLowerCase() === tidy.toLowerCase());
  if (common) return common;
  if (tidy !== tidy.toLowerCase()) return tidy;
  return tidy.replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * What makes two recipes the same: the same grains in the same amounts,
 * whatever order or case they were entered in. "78% Corn · 10% Rye" and
 * "10% rye · 78.00% corn" share a key.
 */
export function recipeKey(grains: readonly Grain[]): string {
  return grains
    .map((g) => `${g.grain.trim().toLowerCase()}:${Number(g.percent)}`)
    .sort()
    .join("|");
}

/** Bourbon and rye pickers require at least 51% of their defining grain. */
export function matchesMashbillCategory(grains: readonly Grain[], category: string | null): boolean {
  if (category !== "bourbon" && category !== "rye") return true;
  const grainName = category === "bourbon" ? "corn" : "rye";
  const share = grains.reduce((total, { grain, percent }) => {
    const name = grain.trim().toLowerCase();
    const matches = name === grainName || name.endsWith(` ${grainName}`);
    return matches ? total + Number(percent) : total;
  }, 0);
  return share >= 51;
}

/** Validation and category warnings for the mashbill popup, in display order. */
export function mashbillProblems(input: {
  isSecret: boolean;
  isGeneric: boolean;
  isPartial: boolean;
  name: string;
  grains: readonly { grain: string; percent: string | number }[];
  /** Lower-case category name ("bourbon", "rye") or null. */
  category: string | null;
}): Problem[] {
  const problems: Problem[] = [];
  if (input.isGeneric) {
    if (!input.name.trim()) {
      problems.push({ text: "Name the style, such as High Rye.", blocking: true });
    }
    return problems;
  }
  if (input.isSecret && !input.name.trim()) {
    problems.push({
      text: "Give a secret mashbill a reference name, such as Buffalo Trace Wheated.",
      blocking: true,
    });
  }

  const grains = input.grains.filter(({ grain, percent }) => grain.trim() || String(percent).trim());
  if (grains.some(({ grain, percent }) => !grain.trim() && String(percent).trim() !== "")) {
    problems.push({ text: "Name every ingredient.", blocking: true });
  }
  if (grains.some(({ grain, percent }) => grain.trim() && (!Number.isFinite(Number(percent)) || Number(percent) <= 0))) {
    problems.push({ text: "Give every ingredient a share.", blocking: true });
  }

  const seen = new Set<string>();
  for (const row of grains) {
    const key = normalizeGrainName(row.grain).toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      problems.push({ text: `${row.grain} is in there twice. Combine them into one row.`, blocking: true });
      break;
    }
    seen.add(key);
  }

  if (grains.length === 0) {
    if (!input.isSecret) problems.push({ text: "Add at least one ingredient.", blocking: true });
    return problems;
  }
  const total = sumGrains(grains);
  if (total > GRAIN_TOTAL.max || (!input.isPartial && total < GRAIN_TOTAL.min)) {
    const rounded = Number(total.toFixed(2));
    const distance = Number(Math.abs(GRAIN_TOTAL.exact - total).toFixed(2));
    problems.push({
      text: input.isPartial
        ? `The disclosed grains exceed 100% (${rounded}%).`
        : `The grains add up to ${rounded}%, not 100%. That is ${distance} ${total > GRAIN_TOTAL.exact ? "over" : "short"}.`,
      blocking: true,
    });
  }
  if (!matchesMashbillCategory(grains, input.category)) {
    problems.push({
      // The label's own picker keeps such a recipe out of its list, so "it will still save" needs saying fully.
      text: `${input.category === "bourbon"
        ? "A bourbon mashbill is at least 51% corn."
        : "A rye mashbill is at least 51% rye."} It will still save, but it is not added to this label.`,
      blocking: false,
      notice: true,
    });
  }
  return problems;
}
