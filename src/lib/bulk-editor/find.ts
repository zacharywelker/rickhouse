import { words } from "@/lib/expressions/label-search";
import { compareRows, type SheetRow } from "./sheet";

/**
 * Finding rows in the editor: search, filters and sort, applied to the rows already on the page (a home collection is
 * hundreds of rows, all loaded). Pure. These change what is *shown*, never what is saved.
 *
 * The rule that keeps them from fighting the entry flow: a row the person has worked on this session (typed, edited,
 * moved, saved) stays on the sheet whatever the filter says, and stays where it was whatever the sort says, until the
 * filter is cleared or the page is reloaded. Otherwise typing a bourbon while looking at gin would make it vanish.
 */

export type Sort = { column: string; desc: boolean };

export type Find = {
  q: string;
  categoryIds: number[];
  brandIds: number[];
  /** Store names, as a bottle has them (a bottle row only; a label has no store). */
  stores: string[];
  sort: Sort | null;
};

export const NO_FIND: Find = { q: "", categoryIds: [], brandIds: [], stores: [], sort: null };

/** How many of search and the three filters are narrowing the sheet (a sort does not hide anything). */
export function filterCount(find: Find): number {
  return (find.q.trim() !== "" ? 1 : 0) + (find.categoryIds.length > 0 ? 1 : 0) + (find.brandIds.length > 0 ? 1 : 0) + (find.stores.length > 0 ? 1 : 0);
}

export const isFiltered = (find: Find): boolean => filterCount(find) > 0;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Everything a row could be found by, as lower-case words: the label's, and for a bottle row the bottle's own too. */
export function haystack(row: SheetRow): string {
  const { label, bottle } = row;
  const parts: Array<string | null | undefined> = [
    label.brand,
    label.name,
    label.category,
    label.upc,
    ...label.links.distilleries.map((d) => d.label),
    ...label.links.finishes.map((f) => f.label),
    ...(bottle ? [bottle.storeName, bottle.pickName, bottle.notes, bottle.location] : []),
  ];
  return words(parts.filter(Boolean).join(" ")).join(" ");
}

/** Every word typed is somewhere in the row (as the start of a word or inside one), in any order: "four roses binnys" finds it. */
export function matchesSearch(row: SheetRow, q: string, hay: string = haystack(row)): boolean {
  const needles = words(q);
  return needles.every((needle) => hay.includes(needle));
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function matchesFilters(row: SheetRow, find: Find): boolean {
  if (find.categoryIds.length > 0 && !find.categoryIds.includes(row.label.categoryId)) return false;
  if (find.brandIds.length > 0 && !find.brandIds.includes(row.label.brandId)) return false;
  if (find.stores.length > 0 && !(row.bottle?.storeName && find.stores.includes(row.bottle.storeName))) return false;
  return find.q.trim() === "" || matchesSearch(row, find.q);
}

/**
 * The rows to show. `pinned` says which rows have been worked on (see the top of the file): they pass every filter.
 * Nothing is reordered here.
 */
export function filterRows(rows: ReadonlyArray<SheetRow>, find: Find, pinned: (row: SheetRow) => boolean): SheetRow[] {
  if (!isFiltered(find)) return [...rows];
  return rows.filter((row) => pinned(row) || matchesFilters(row, find));
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type Value = string | number | null;
const num = (value: string | number | null | undefined): number | null => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);

/** What a column sorts by, or undefined for a column that cannot be sorted (it holds several values, or a list). */
const SORT_VALUES: Record<string, (row: SheetRow) => Value> = {
  brand: (r) => r.label.brand,
  name: (r) => r.label.name,
  category: (r) => r.label.category,
  sizeMl: (r) => r.label.sizeMl,
  proof: (r) => num(r.label.proof),
  msrp: (r) => num(r.label.msrp),
  bottleCount: (r) => r.label.bottleCount,
  pricePaid: (r) => num(r.bottle?.pricePaid),
  store: (r) => r.bottle?.storeName ?? null,
  dateAcquired: (r) => r.bottle?.dateAcquired ?? null,
  status: (r) => r.bottle?.status ?? null,
  releaseYear: (r) => r.bottle?.releaseYear ?? null,
  pickName: (r) => r.bottle?.pickName ?? null,
  location: (r) => r.bottle?.location ?? null,
  notes: (r) => r.bottle?.notes ?? null,
  ownProof: (r) => num(r.bottle?.proof ?? r.label.proof),
  ownSize: (r) => r.bottle?.sizeMl ?? r.label.sizeMl,
};

export const isSortable = (column: string): boolean => column in SORT_VALUES;

function compareValues(a: Value, b: Value, desc: boolean): number {
  // A row with nothing in the column goes last, whichever way it is sorted.
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
  return desc ? -order : order;
}

/**
 * The rows in the sort's order, ties in the usual shelf order. Each row is placed by the values it had when the sheet
 * loaded (`baseline`), so a row that has been edited stays in place: editing a price does not make the row jump to a
 * new spot under the cursor. With no sort, the rows are returned as they are.
 */
export function sortRows(rows: ReadonlyArray<SheetRow>, sort: Sort | null, baseline: ReadonlyMap<string, SheetRow>): SheetRow[] {
  const value = sort ? SORT_VALUES[sort.column] : undefined;
  if (!sort || !value) return [...rows];
  const at = (row: SheetRow) => baseline.get(row.key) ?? row;
  return [...rows].sort((a, b) => compareValues(value(at(a)), value(at(b)), sort.desc) || compareRows(at(a), at(b)));
}

/** The next sort for a click on a column's header: ascending, then descending, then back to the shelf order. */
export function nextSort(current: Sort | null, column: string): Sort | null {
  if (current?.column !== column) return { column, desc: false };
  return current.desc ? null : { column, desc: true };
}
