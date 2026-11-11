import { words } from "@/lib/expressions/label-search";
import type { CategoryKind } from "@/lib/expressions/rules";
import { whiskeyAge } from "@/lib/expressions/whiskey-age";
import { compareRows, type SheetLabel, type SheetRow } from "./sheet";

/** What ages are worked out against: the category's kind, which sets the minimum age a whiskey designation implies. */
export type FindContext = { kinds: Readonly<Record<number, CategoryKind>> };

/**
 * Finding rows in the editor: search, filters and sort, applied to the rows already on the page (a home collection is
 * hundreds of rows, all loaded). Pure. These change what is *shown*, never what is saved.
 *
 * The rule that keeps them from fighting the entry flow: a row the person has worked on this session (typed, edited,
 * moved, saved) stays on the sheet whatever the filter says, and stays where it was whatever the sort says, until the
 * filter is cleared or the page is reloaded. Otherwise typing a bourbon while looking at gin would make it vanish.
 */

export type Sort = { column: string; desc: boolean };

const num = (value: string | number | null | undefined): number | null => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);

/** Inclusive, either end open. */
export type Range = { min: number | null; max: number | null };
export const NO_RANGE: Range = { min: null, max: null };
const hasBound = (range: Range) => range.min !== null || range.max !== null;

export type Find = {
  q: string;
  categoryIds: number[];
  brandIds: number[];
  /** Store names, as a bottle has them. A bottle's filter: it does not apply to a row that is only a label. */
  stores: string[];
  distilleryIds: number[];
  mashbillIds: number[];
  finishIds: number[];
  /** Ingredient names (the sheet's labels carry names, not ids). */
  ingredients: string[];
  /** The proof and age a row has: its bottle's own if it has one, else its label's. */
  proof: Range;
  age: Range;
  /** What was paid (a bottle's filter) and the label's MSRP. */
  price: Range;
  msrp: Range;
  sort: Sort | null;
};

export const NO_FIND: Find = {
  q: "", categoryIds: [], brandIds: [], stores: [], distilleryIds: [], mashbillIds: [], finishIds: [], ingredients: [],
  proof: NO_RANGE, age: NO_RANGE, price: NO_RANGE, msrp: NO_RANGE, sort: null,
};

/** How many filters are narrowing the sheet, search included (a sort does not hide anything). */
export function filterCount(find: Find): number {
  const lists = [find.categoryIds, find.brandIds, find.stores, find.distilleryIds, find.mashbillIds, find.finishIds, find.ingredients];
  const ranges = [find.proof, find.age, find.price, find.msrp];
  return (find.q.trim() !== "" ? 1 : 0) + lists.filter((l) => l.length > 0).length + ranges.filter(hasBound).length;
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
// Numbers a row has
// ---------------------------------------------------------------------------

type AgeParts = { ageYears: string | number | null; ageMonths: number | null; ageDays: number | null; ageStatement: string | null };

/**
 * An age in years from what is written down: the entered years, months and days if any are given; otherwise a youngest
 * age read from a statement ("8 to 12 years" is 8, "12 year" is 12). See `labelAgeYears` for what a label's age is.
 */
export function ageInYears(a: AgeParts): number | null {
  if (a.ageYears !== null || a.ageMonths !== null || a.ageDays !== null) return Number(a.ageYears ?? 0) + (a.ageMonths ?? 0) / 12 + (a.ageDays ?? 0) / 365;
  const text = a.ageStatement ?? "";
  const range = /([0-9]{1,3}(?:\.[0-9])?)\s*(?:to|[-–—])\s*[0-9]{1,3}(?:\.[0-9])?\s*(?:years?|yrs?)/i.exec(text);
  const single = /([0-9]{1,3}(?:\.[0-9])?)\s*(?:years?|yrs?)/i.exec(text);
  const found = range?.[1] ?? single?.[1];
  return found === undefined ? null : Number(found);
}

const hasOwnAge = (b: SheetRow["bottle"]) => b !== null && (b.ageYears !== null || b.ageMonths !== null || b.ageDays !== null || (b.ageStatement ?? "").trim() !== "");

/**
 * A label's age as the Age column and the table's age filter have it. For a whiskey that includes the minimum its
 * designation implies (Bottled in Bond 4 years, straight 2, Scotch 3), which is why the column can say "4 yrs" with
 * nothing entered; a vodka, or an amaro or liqueur that is not aged, has none.
 */
export function labelAgeYears(label: SheetLabel, ctx: FindContext): number | null {
  const group = label.fieldGroup;
  if (group === "vodka" || ((group === "amaro" || group === "liqueur") && !label.isAged)) return null;
  if (group === "whiskey") return whiskeyAge(label, ctx.kinds[label.categoryId] ?? "other").groupingYears;
  return ageInYears(label);
}

/** A row's age: its bottle's own if the bottle says one, else the label's. */
export const ageOf = (row: SheetRow, ctx: FindContext): number | null => (hasOwnAge(row.bottle) ? ageInYears(row.bottle!) : labelAgeYears(row.label, ctx));
/** A row's proof: its bottle's own if it has one, else the label's. */
export const proofOf = (row: SheetRow): number | null => num(row.bottle?.proof ?? row.label.proof);

const inRange = (value: number | null, range: Range): boolean => !hasBound(range) || (value !== null && (range.min === null || value >= range.min) && (range.max === null || value <= range.max));

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Whether a row passes every filter that is set, all of which must hold. A bottle's filters (store, price paid) say
 * nothing about a row that is only a label, so in a Labels-only view they let it through.
 */
export function matchesFilters(row: SheetRow, find: Find, ctx: FindContext): boolean {
  const { label, bottle } = row;
  if (find.categoryIds.length > 0 && !find.categoryIds.includes(label.categoryId)) return false;
  if (find.brandIds.length > 0 && !find.brandIds.includes(label.brandId)) return false;
  if (find.distilleryIds.length > 0 && !label.links.distilleries.some((d) => find.distilleryIds.includes(d.id))) return false;
  if (find.mashbillIds.length > 0 && !label.links.mashbills.some((m) => find.mashbillIds.includes(m.id))) return false;
  if (find.finishIds.length > 0 && !label.links.finishes.some((f) => find.finishIds.includes(f.id))) return false;
  if (find.ingredients.length > 0 && !(label.links.ingredients ?? []).some((i) => find.ingredients.includes(i.name))) return false;
  if (!inRange(proofOf(row), find.proof) || !inRange(ageOf(row, ctx), find.age) || !inRange(num(label.msrp), find.msrp)) return false;
  if (bottle) {
    if (find.stores.length > 0 && !(bottle.storeName && find.stores.includes(bottle.storeName))) return false;
    if (!inRange(num(bottle.pricePaid), find.price)) return false;
  }
  return find.q.trim() === "" || matchesSearch(row, find.q);
}

/**
 * The rows to show. `pinned` says which rows have been worked on (see the top of the file): they pass every filter.
 * Nothing is reordered here.
 */
export function filterRows(rows: ReadonlyArray<SheetRow>, find: Find, pinned: (row: SheetRow) => boolean, ctx: FindContext): SheetRow[] {
  if (!isFiltered(find)) return [...rows];
  return rows.filter((row) => pinned(row) || matchesFilters(row, find, ctx));
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type Value = string | number | null;

/** A label's linked names in their order, as one value to sort by, or nothing for a label with none. */
const links = (rows: ReadonlyArray<{ label: string }>): string | null => (rows.length === 0 ? null : rows.map((r) => r.label).join(", "));

/** What a column sorts by, or undefined for a column that cannot be sorted (it holds several values, or a list). */
const SORT_VALUES: Record<string, (row: SheetRow, ctx: FindContext) => Value> = {
  brand: (r) => r.label.brand,
  name: (r) => r.label.name,
  category: (r) => r.label.category,
  sizeMl: (r) => r.label.sizeMl,
  proof: (r) => num(r.label.proof),
  age: (r, ctx) => labelAgeYears(r.label, ctx),
  ownAge: (r, ctx) => ageOf(r, ctx),
  distilleries: (r) => links(r.label.links.distilleries),
  mashbills: (r) => links(r.label.links.mashbills),
  finishes: (r) => links(r.label.links.finishes),
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
export function sortRows(rows: ReadonlyArray<SheetRow>, sort: Sort | null, baseline: ReadonlyMap<string, SheetRow>, ctx: FindContext): SheetRow[] {
  const value = sort ? SORT_VALUES[sort.column] : undefined;
  if (!sort || !value) return [...rows];
  const at = (row: SheetRow) => baseline.get(row.key) ?? row;
  return [...rows].sort((a, b) => compareValues(value(at(a), ctx), value(at(b), ctx), sort.desc) || compareRows(at(a), at(b)));
}

/** The next sort for a click on a column's header: ascending, then descending, then back to the shelf order. */
export function nextSort(current: Sort | null, column: string): Sort | null {
  if (current?.column !== column) return { column, desc: false };
  return current.desc ? null : { column, desc: true };
}
