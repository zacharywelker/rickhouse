/**
 * Fill-gauge geometry, kept apart from the component so it can be tested and
 * so the grid's tiny read-only dial and the big interactive one cannot drift.
 *
 * The gauge is a fuel dial: Empty at the left end of a half circle, Full at
 * the right, the needle straight up at half.
 */

export function clampPct(value: number): number {
  // NaN is bad input and means empty; Infinity is just "past the top".
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** The dial ticks every 5%: the finest the eye can set, and the grid pointer and keys land on. */
export const FILL_TICK_STEP = 5;

export function snapToTick(pct: number): number {
  return clampPct(Math.round(pct / FILL_TICK_STEP) * FILL_TICK_STEP);
}

/**
 * One key press: to the next tick in `direction`, so an off-tick value (an imported 63%) lands on the grid
 * rather than staying 3 off it. `quarter` moves 25 and lands on a tick.
 */
export function nudgePct(pct: number, direction: 1 | -1, quarter = false): number {
  const p = clampPct(pct);
  if (quarter) return snapToTick(p + direction * 25);
  const step = FILL_TICK_STEP;
  return clampPct(direction === 1 ? (Math.floor(p / step) + 1) * step : (Math.ceil(p / step) - 1) * step);
}

/** Needle rotation from straight up: -90° at Empty, 0° at half, +90° at Full. */
export function needleDeg(pct: number): number {
  return (clampPct(pct) - 50) * 1.8;
}

/** Below this the pointer is on the "E" peg: a bottle you pour out is Empty, not Almost gone. */
const EMPTY_PEG_PCT = 3;

/**
 * Pointer offset from the dial's hub (x right, y down, in pixels) to the tick
 * it lands on. The dial detents like a real gauge rather than resting on 63%:
 * nobody knows their bottle is at 63% (DESIGN.md §21).
 */
export function pctFromDial(dx: number, dy: number): number {
  // Below the hub there is no angle to read; stick to whichever peg is nearer.
  if (dy > 0) return dx < 0 ? 0 : 100;
  // abs, not -dy: dy is 0 level with the hub, and atan2(-0, -x) is -π, which would read the left peg as Full.
  const angle = Math.atan2(Math.abs(dy), dx); // 0 = right (Full), π = left (Empty)
  const raw = ((Math.PI - angle) / Math.PI) * 100;
  return raw < EMPTY_PEG_PCT ? 0 : snapToTick(raw);
}
