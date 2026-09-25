/**
 * Labels grid state, serialised to the URL exactly like the bottle grid
 * (src/lib/bottles/filters.ts) — a filtered, paged view is a bookmark and the
 * back button behaves. Pure: no database, no React — parse in, search string
 * out.
 */

export const LABEL_SORTS = ["brand", "name", "category", "proof", "age", "msrp", "bottles"] as const;
export type LabelSort = (typeof LABEL_SORTS)[number];

export const PAGE_SIZES = [25, 50, 100, 250] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type LabelFilters = {
  q: string | null;
  brandIds: number[];
  categoryIds: number[];
  sort: LabelSort;
  desc: boolean;
  page: number;
  pageSize: number;
};

export const DEFAULT_FILTERS: LabelFilters = {
  q: null,
  brandIds: [],
  categoryIds: [],
  sort: "brand",
  desc: false,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string | null {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined || raw === "" ? null : raw;
}

/** "1,2,3" -> [1, 2, 3], dropping anything that is not a positive integer. */
function idList(params: Params, key: string): number[] {
  const raw = first(params, key);
  if (raw === null) return [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen].slice(0, 50);
}

export function parseLabelFilters(params: Params): LabelFilters {
  const sortRaw = first(params, "sort");
  const pageSizeRaw = Number(first(params, "size"));
  const page = Number(first(params, "page"));

  return {
    q: first(params, "q"),
    brandIds: idList(params, "brand"),
    categoryIds: idList(params, "category"),
    sort: (LABEL_SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as LabelSort) : DEFAULT_FILTERS.sort,
    desc: first(params, "dir") === "desc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE,
  };
}

/** Kept for the sort-link URLs already built into the table header. */
export function parseLabelSort(raw: string | null | undefined): LabelSort {
  return (LABEL_SORTS as readonly string[]).includes(raw ?? "") ? (raw as LabelSort) : "brand";
}

/**
 * Back to a query string, omitting anything at its default so a plain view
 * has a clean URL.
 */
export function serialiseLabelFilters(filters: LabelFilters): string {
  const params = new URLSearchParams();
  const ids = (key: string, values: number[]) => {
    if (values.length > 0) params.set(key, values.join(","));
  };

  if (filters.q) params.set("q", filters.q);
  ids("brand", filters.brandIds);
  ids("category", filters.categoryIds);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.desc) params.set("dir", "desc");
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) params.set("size", String(filters.pageSize));

  return params.toString();
}

/** How many filters are actually narrowing the list, for the "clear" affordance. */
export function activeLabelFilterCount(filters: LabelFilters): number {
  let count = 0;
  if (filters.q) count += 1;
  count += filters.brandIds.length > 0 ? 1 : 0;
  count += filters.categoryIds.length > 0 ? 1 : 0;
  return count;
}
