import type { BottleFilters } from "@/lib/bottles/filters";
import { smartGroupQuery } from "@/lib/groups/smart";

export type RailGroup = { id: number; name: string; filterQuery: string | null };

export function groupHref(group: RailGroup): string {
  if (group.filterQuery === null) return `/bottles?group=${group.id}`;
  return group.filterQuery ? `/bottles?${group.filterQuery}` : "/bottles";
}

export function currentGroup(filters: BottleFilters, groups: RailGroup[]): RailGroup | null {
  const query = smartGroupQuery(filters);
  return groups.find((group) => group.filterQuery === null
    ? filters.groupId === group.id
    : query !== "" && group.filterQuery === query) ?? null;
}

export const RAIL_MIN_WIDTH = 1100;

export function railInitiallyOpen(viewportWidth: number, stored: string | null): boolean {
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return viewportWidth >= RAIL_MIN_WIDTH;
}
