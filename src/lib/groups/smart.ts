import { DEFAULT_FILTERS, DEFAULT_PAGE_SIZE, parseFilters, serialiseFilters, type BottleFilters } from "@/lib/bottles/filters";

/**
 * Smart groups store the Collection's filters as the same query string the
 * Collection puts in its URL, so "Open in Collection" is just that string and
 * a group never needs its own filter vocabulary. Pure.
 */

/** Plenty for a group page; a smart group that matches more is a filter, not a group. */
export const SMART_GROUP_LIMIT = 500;

/**
 * What to keep: what the bottles are and the order they are in. Paging, view
 * and hidden columns are how one screen happened to look, not the group.
 */
export function smartGroupQuery(filters: BottleFilters): string {
  return serialiseFilters({
    ...filters,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    view: DEFAULT_FILTERS.view,
    hidden: [],
  });
}

/** The filters a stored query stands for, sized to fetch the whole group at once. */
export function smartGroupFilters(query: string, limit = SMART_GROUP_LIMIT): BottleFilters {
  return { ...parseFilters(Object.fromEntries(new URLSearchParams(query))), page: 1, pageSize: limit };
}
