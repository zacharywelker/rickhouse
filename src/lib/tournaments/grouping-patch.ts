import type { GroupKey } from "./types";

export type Grouping = { groupOrder: readonly GroupKey[]; seeding: "similar" | "random" };
export type GroupingPatch = { groupOrder?: GroupKey[]; seeding?: "similar" | "random" };

/** Only the grouping settings that differ from `current` (order compared element by element), or null when none do. */
export function groupingPatch(current: Grouping, next: Grouping): GroupingPatch | null {
  const patch: GroupingPatch = {};
  const sameOrder = current.groupOrder.length === next.groupOrder.length && current.groupOrder.every((k, i) => k === next.groupOrder[i]);
  if (!sameOrder) patch.groupOrder = [...next.groupOrder];
  if (current.seeding !== next.seeding) patch.seeding = next.seeding;
  return Object.keys(patch).length > 0 ? patch : null;
}
