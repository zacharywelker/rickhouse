import { BOTTLE_STATUSES, type BottleStatus } from "@/db/schema";

/**
 * Grid state, serialised to the URL so a view can be bookmarked and shared
 * (SPEC M4). Pure: no database, no React — parse in, search string out.
 */

export const SORTABLE = [
  "acquired",
  "brand",
  "expression",
  "category",
  "proof",
  "age",
  "price",
  "msrp",
  "fill",
  "rating",
  "status",
] as const;
export type SortKey = (typeof SORTABLE)[number];

export const VIEW_MODES = ["table", "gallery"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const OPEN_STATES = ["any", "open", "closed"] as const;
export type OpenState = (typeof OPEN_STATES)[number];

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type Range = { min: number | null; max: number | null };

export type BottleFilters = {
  q: string | null;
  categoryIds: number[];
  brandIds: number[];
  distilleryIds: number[];
  mashbillIds: number[];
  finishIds: number[];
  storeIds: number[];
  tagIds: number[];
  statuses: BottleStatus[];
  open: OpenState;
  favorite: boolean;
  proof: Range;
  age: Range;
  price: Range;
  sort: SortKey;
  desc: boolean;
  page: number;
  pageSize: number;
  view: ViewMode;
  /** Column keys hidden by the column-visibility control. */
  hidden: string[];
};

export const DEFAULT_FILTERS: BottleFilters = {
  q: null,
  categoryIds: [],
  brandIds: [],
  distilleryIds: [],
  mashbillIds: [],
  finishIds: [],
  storeIds: [],
  tagIds: [],
  statuses: [],
  open: "any",
  favorite: false,
  proof: { min: null, max: null },
  age: { min: null, max: null },
  price: { min: null, max: null },
  sort: "acquired",
  desc: true,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  view: "table",
  hidden: [],
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

function stringList<T extends string>(params: Params, key: string, allowed: readonly T[]): T[] {
  const raw = first(params, key);
  if (raw === null) return [];
  const seen = new Set<T>();
  for (const part of raw.split(",")) {
    const value = part.trim() as T;
    if (allowed.includes(value)) seen.add(value);
  }
  return [...seen];
}

function numberOrNull(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function range(params: Params, key: string, min: number, max: number): Range {
  return {
    min: numberOrNull(first(params, `${key}Min`), min, max),
    max: numberOrNull(first(params, `${key}Max`), min, max),
  };
}

export function parseFilters(params: Params): BottleFilters {
  const sortRaw = first(params, "sort");
  const viewRaw = first(params, "view");
  const openRaw = first(params, "open");
  const pageSizeRaw = Number(first(params, "size"));
  const page = Number(first(params, "page"));

  return {
    q: first(params, "q"),
    categoryIds: idList(params, "category"),
    brandIds: idList(params, "brand"),
    distilleryIds: idList(params, "distillery"),
    mashbillIds: idList(params, "mashbill"),
    finishIds: idList(params, "finish"),
    storeIds: idList(params, "store"),
    tagIds: idList(params, "tag"),
    statuses: stringList(params, "status", BOTTLE_STATUSES),
    open: (OPEN_STATES as readonly string[]).includes(openRaw ?? "") ? (openRaw as OpenState) : "any",
    favorite: first(params, "fav") === "1",
    proof: range(params, "proof", 0, 200),
    age: range(params, "age", 0, 100),
    price: range(params, "price", 0, 100000),
    sort: (SORTABLE as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as SortKey) : DEFAULT_FILTERS.sort,
    // Ascending is the explicit opt-in; the default view is newest first.
    desc: first(params, "dir") !== "asc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE,
    view: (VIEW_MODES as readonly string[]).includes(viewRaw ?? "") ? (viewRaw as ViewMode) : "table",
    hidden: (first(params, "hide") ?? "").split(",").filter((s) => s !== ""),
  };
}

/**
 * Back to a query string, omitting anything at its default so a plain view has
 * a clean URL.
 */
export function serialiseFilters(filters: BottleFilters): string {
  const params = new URLSearchParams();
  const ids = (key: string, values: number[]) => {
    if (values.length > 0) params.set(key, values.join(","));
  };

  if (filters.q) params.set("q", filters.q);
  ids("category", filters.categoryIds);
  ids("brand", filters.brandIds);
  ids("distillery", filters.distilleryIds);
  ids("mashbill", filters.mashbillIds);
  ids("finish", filters.finishIds);
  ids("store", filters.storeIds);
  ids("tag", filters.tagIds);
  if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
  if (filters.open !== "any") params.set("open", filters.open);
  if (filters.favorite) params.set("fav", "1");

  for (const [key, value] of [
    ["proof", filters.proof],
    ["age", filters.age],
    ["price", filters.price],
  ] as const) {
    if (value.min !== null) params.set(`${key}Min`, String(value.min));
    if (value.max !== null) params.set(`${key}Max`, String(value.max));
  }

  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (!filters.desc) params.set("dir", "asc");
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) params.set("size", String(filters.pageSize));
  if (filters.view !== "table") params.set("view", filters.view);
  if (filters.hidden.length > 0) params.set("hide", filters.hidden.join(","));

  return params.toString();
}

/** How many filters are actually narrowing the list, for the "clear" affordance. */
export function activeFilterCount(filters: BottleFilters): number {
  let count = 0;
  if (filters.q) count += 1;
  count += filters.categoryIds.length > 0 ? 1 : 0;
  count += filters.brandIds.length > 0 ? 1 : 0;
  count += filters.distilleryIds.length > 0 ? 1 : 0;
  count += filters.mashbillIds.length > 0 ? 1 : 0;
  count += filters.finishIds.length > 0 ? 1 : 0;
  count += filters.storeIds.length > 0 ? 1 : 0;
  count += filters.tagIds.length > 0 ? 1 : 0;
  count += filters.statuses.length > 0 ? 1 : 0;
  count += filters.open !== "any" ? 1 : 0;
  count += filters.favorite ? 1 : 0;
  for (const r of [filters.proof, filters.age, filters.price]) {
    if (r.min !== null || r.max !== null) count += 1;
  }
  return count;
}
