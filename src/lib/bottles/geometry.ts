/**
 * Fill-gauge geometry, kept apart from the component so it can be tested and
 * so the grid's tiny read-only gauge and the big interactive one cannot drift.
 */
export const LIQUID_BOTTOM = 204;
export const LIQUID_TOP = 40;

export function clampPct(value: number): number {
  // NaN is bad input and means empty; Infinity is just "past the top".
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Percentage -> y of the liquid surface in the 0..220 viewBox. */
export function surfaceY(pct: number): number {
  return LIQUID_BOTTOM - ((LIQUID_BOTTOM - LIQUID_TOP) * clampPct(pct)) / 100;
}

/** y within the viewBox -> percentage. The inverse of `surfaceY`. */
export function pctFromY(yInView: number): number {
  return clampPct(((LIQUID_BOTTOM - yInView) / (LIQUID_BOTTOM - LIQUID_TOP)) * 100);
}
