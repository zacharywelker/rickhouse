import type { BottleFilters } from "@/lib/bottles/filters";
import { smartGroupQuery } from "@/lib/groups/smart";

export type RailGroup = { id: number; name: string; filterQuery: string | null };

export function groupHref(group: RailGroup): string {
  if (group.filterQuery === null) return `/bottles?group=${group.id}`;
  return group.filterQuery ? `/bottles?${group.filterQuery}` : "/bottles";
}

export function currentGroup(filters: BottleFilters, groups: RailGroup[]): RailGroup | null {
  // An explicit group id decides it: the bottles shown are that group's, whatever other filters are also on.
  // (smartGroupQuery drops the id, so matching smart groups first could name the wrong one.)
  if (filters.groupId !== null) return groups.find((group) => group.filterQuery === null && group.id === filters.groupId) ?? null;
  const query = smartGroupQuery(filters);
  if (query === "") return null;
  return groups.find((group) => group.filterQuery !== null && group.filterQuery === query) ?? null;
}

export const RAIL_MIN_WIDTH = 1100;

export function railInitiallyOpen(viewportWidth: number, stored: string | null): boolean {
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return viewportWidth >= RAIL_MIN_WIDTH;
}
