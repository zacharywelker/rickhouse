import { fillState } from "./fill-state";

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

/** Needle rotation from straight up: -90° at Empty, 0° at half, +90° at Full. */
export function needleDeg(pct: number): number {
  return (clampPct(pct) - 50) * 1.8;
}

/** Below this the pointer is on the "E" peg: a bottle you pour out is Empty, not Almost gone. */
const EMPTY_PEG_PCT = 3;

/**
 * Pointer offset from the dial's hub (x right, y down, in pixels) to the quick
 * state it lands on. The dial detents like a real gauge rather than resting
 * on 63%: nobody knows their bottle is at 63% (DESIGN.md §21).
 */
export function pctFromDial(dx: number, dy: number): number {
  // Below the hub there is no angle to read; stick to whichever peg is nearer.
  if (dy > 0) return dx < 0 ? 0 : 100;
  // abs, not -dy: dy is 0 level with the hub, and atan2(-0, -x) is -π, which would read the left peg as Full.
  const angle = Math.atan2(Math.abs(dy), dx); // 0 = right (Full), π = left (Empty)
  const raw = ((Math.PI - angle) / Math.PI) * 100;
  return raw < EMPTY_PEG_PCT ? 0 : fillState(raw).pct;
}
