import { ACQUISITIONS, BOTTLE_STATUSES, type Acquisition, type BottleStatus } from "@/db/schema";

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

/** Inclusive ISO dates (YYYY-MM-DD), either end open. */
export type DateRange = { from: string | null; to: string | null };

/**
 * What the Collection shows until you ask for more: what's on the shelf.
 * "Collection is ownership" (DESIGN.md §15) — wishlist, killed, sold and
 * traded bottles are one Status click away. An empty list means every status,
 * which the URL spells as `status=all`.
 */
export const DEFAULT_STATUSES: BottleStatus[] = ["owned", "open"];

/** Order-insensitive, so ticking open then owned still counts as the default. */
export function isDefaultStatuses(statuses: BottleStatus[]): boolean {
  return statuses.length === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every((s) => statuses.includes(s));
}

function parseStatuses(raw: string | null): BottleStatus[] {
  if (raw === null) return [...DEFAULT_STATUSES];
  if (raw === "all") return [];
  const seen = new Set<BottleStatus>();
  for (const part of raw.split(",")) {
    const value = part.trim() as BottleStatus;
    if (BOTTLE_STATUSES.includes(value)) seen.add(value);
  }
  // Nothing recognisable is the same as asking for nothing in particular.
  return seen.size > 0 ? [...seen] : [...DEFAULT_STATUSES];
}

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
  /* The filters below are where Numbers findings land (the bottles behind a claim). */
  acquisitions: Acquisition[];
  acquired: DateRange;
  fill: Range;
  caskStrength: boolean;
  bottledInBond: boolean;
  pick: boolean;
  overMsrp: boolean;
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
  statuses: DEFAULT_STATUSES,
  open: "any",
  favorite: false,
  proof: { min: null, max: null },
  age: { min: null, max: null },
  price: { min: null, max: null },
  acquisitions: [],
  acquired: { from: null, to: null },
  fill: { min: null, max: null },
  caskStrength: false,
  bottledInBond: false,
  pick: false,
  overMsrp: false,
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

function isoDate(raw: string | null): string | null {
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  // Round-trip, because Date rolls 2024-02-30 over to March where Postgres would throw.
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

function acquisitionList(raw: string | null): Acquisition[] {
  if (raw === null) return [];
  const seen = new Set<Acquisition>();
  for (const part of raw.split(",")) {
    const value = part.trim() as Acquisition;
    if (ACQUISITIONS.includes(value)) seen.add(value);
  }
  return [...seen];
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
    statuses: parseStatuses(first(params, "status")),
    open: (OPEN_STATES as readonly string[]).includes(openRaw ?? "") ? (openRaw as OpenState) : "any",
    favorite: first(params, "fav") === "1",
    proof: range(params, "proof", 0, 200),
    age: range(params, "age", 0, 100),
    price: range(params, "price", 0, 100000),
    acquisitions: acquisitionList(first(params, "acq")),
    acquired: { from: isoDate(first(params, "acquiredFrom")), to: isoDate(first(params, "acquiredTo")) },
    fill: range(params, "fill", 0, 100),
    caskStrength: first(params, "cs") === "1",
    bottledInBond: first(params, "bib") === "1",
    pick: first(params, "pick") === "1",
    overMsrp: first(params, "overMsrp") === "1",
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
  if (!isDefaultStatuses(filters.statuses)) params.set("status", filters.statuses.length > 0 ? filters.statuses.join(",") : "all");
  if (filters.open !== "any") params.set("open", filters.open);
  if (filters.favorite) params.set("fav", "1");

  for (const [key, value] of [
    ["proof", filters.proof],
    ["age", filters.age],
    ["price", filters.price],
    ["fill", filters.fill],
  ] as const) {
    if (value.min !== null) params.set(`${key}Min`, String(value.min));
    if (value.max !== null) params.set(`${key}Max`, String(value.max));
  }
  if (filters.acquisitions.length > 0) params.set("acq", filters.acquisitions.join(","));
  if (filters.acquired.from) params.set("acquiredFrom", filters.acquired.from);
  if (filters.acquired.to) params.set("acquiredTo", filters.acquired.to);
  if (filters.caskStrength) params.set("cs", "1");
  if (filters.bottledInBond) params.set("bib", "1");
  if (filters.pick) params.set("pick", "1");
  if (filters.overMsrp) params.set("overMsrp", "1");

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
  count += isDefaultStatuses(filters.statuses) ? 0 : 1;
  count += filters.open !== "any" ? 1 : 0;
  count += filters.favorite ? 1 : 0;
  for (const r of [filters.proof, filters.age, filters.price, filters.fill]) {
    if (r.min !== null || r.max !== null) count += 1;
  }
  count += filters.acquisitions.length > 0 ? 1 : 0;
  count += filters.acquired.from !== null || filters.acquired.to !== null ? 1 : 0;
  for (const flag of [filters.caskStrength, filters.bottledInBond, filters.pick, filters.overMsrp]) {
    count += flag ? 1 : 0;
  }
  return count;
}
