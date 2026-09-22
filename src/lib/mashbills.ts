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
