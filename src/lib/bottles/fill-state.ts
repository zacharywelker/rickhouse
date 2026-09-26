/**
 * Fill level is visual, not laboratory-precise (DESIGN.md §21): nobody knows
 * their bottle is at 63%, but everyone knows it is "about half". The stored
 * value stays a percentage, so the gauge can still be dragged freely; these
 * are the states people set it with and read it as.
 */
export const FILL_STATES = [
  { key: "full", label: "Full", pct: 100 },
  { key: "three-quarters", label: "¾", pct: 75 },
  { key: "half", label: "½", pct: 50 },
  { key: "quarter", label: "¼", pct: 25 },
  { key: "almost-gone", label: "Almost gone", pct: 10 },
  { key: "empty", label: "Empty", pct: 0 },
] as const;

export type FillState = (typeof FILL_STATES)[number];

/**
 * The state a stored percentage reads as. Bands meet halfway between the
 * set-points, except at the ends: only a truly empty bottle is Empty, and
 * anything above zero but under ~18% is Almost gone rather than ¼.
 */
export function fillState(pct: number): FillState {
  if (pct <= 0) return FILL_STATES[5];
  if (pct < 18) return FILL_STATES[4];
  if (pct < 38) return FILL_STATES[3];
  if (pct < 63) return FILL_STATES[2];
  if (pct < 88) return FILL_STATES[1];
  return FILL_STATES[0];
}

/** Screen-reader and tooltip text: "¾" reads as "three quarters full". */
export function fillStateDescription(pct: number): string {
  const state = fillState(pct);
  switch (state.key) {
    case "three-quarters":
      return "Three quarters full";
    case "half":
      return "Half full";
    case "quarter":
      return "A quarter full";
    default:
      return state.label;
  }
}

/** Inline text where a bare "¾" would be ambiguous: "¾ full", "Almost gone", "Empty". */
export function fillStateText(pct: number): string {
  const state = fillState(pct);
  return state.key === "three-quarters" || state.key === "half" || state.key === "quarter"
    ? `${state.label} full`
    : state.label;
}
