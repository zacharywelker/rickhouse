import { DEFAULT_GROUP_ORDER as ENGINE_DEFAULT, type GroupKey } from "./types";

/** Proof first: bottles at different strengths are not a fair taste. The engine owns the default; the setup page starts from it. */
export const DEFAULT_GROUP_ORDER: readonly GroupKey[] = ENGINE_DEFAULT;

/** What each grouping key is called on the page. */
export const GROUP_KEY_LABELS: Record<GroupKey, string> = {
  proof: "Proof",
  mashbill: "Mashbill",
  distillery: "Distillery",
  age: "Age",
  finish: "Finish",
};

/** One line under each key, so the order can be chosen without knowing how the engine compares. */
export const GROUP_KEY_HELP: Record<GroupKey, string> = {
  proof: "In bands of 5, so 100 and 101 count as the same strength.",
  mashbill: "Matching recipes or styles together.",
  distillery: "Bottles from the same distillery together.",
  age: "Similar stated ages together.",
  finish: "The same finish together.",
};

/** A copy of `order` with the key at `index` moved by `delta` places; unchanged when that would leave the list. */
export function moveKey(order: readonly GroupKey[], index: number, delta: number): GroupKey[] {
  const next = [...order];
  const to = index + delta;
  if (!Number.isInteger(index) || index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  next.splice(to, 0, ...next.splice(index, 1));
  return next;
}
