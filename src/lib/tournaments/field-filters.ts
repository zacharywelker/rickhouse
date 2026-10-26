import { z } from "zod";
import { BOTTLE_STATUSES, type BottleStatus } from "@/db/schema";

/**
 * What the setup picker narrows your collection by. Pure: no database, no React.
 *
 * The spec's filters are owned, opened, tasted, category and a manual pick (the manual pick is the checkbox
 * list itself, so it needs no filter). The real bottle statuses are owned, open, killed, sold, traded, wishlist
 * and sampled; "owned" and "opened" in the spec are the `statuses` and `opened` filters below.
 */
export type FieldFilters = {
  /** Words that must all appear in the brand, label name, pick, release or batch. */
  q: string;
  /** A category includes the categories under it. Empty: every category. */
  categoryIds: number[];
  /** Empty: every status. */
  statuses: BottleStatus[];
  opened: "any" | "open" | "sealed";
  /** `tasted`: has at least one tasting note for that bottle. */
  tasted: "any" | "tasted" | "untasted";
};

/** The same default as the Collection: what is on the shelf (owned and open), not bottles that were killed, sold, traded, wished for or sampled. */
export const DEFAULT_FIELD_STATUSES: BottleStatus[] = ["owned", "open"];

export const DEFAULT_FIELD_FILTERS: FieldFilters = {
  q: "",
  categoryIds: [],
  statuses: DEFAULT_FIELD_STATUSES,
  opened: "any",
  tasted: "any",
};

const MAX_CATEGORIES = 50;

/** A list as an array of its items: an array stays, "1,2,3" is split, anything else is empty. */
const items = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []);

const categoryIds = z.unknown().optional().transform((raw) => {
  const seen = new Set<number>();
  for (const item of items(raw)) {
    const n = typeof item === "string" && item.trim() !== "" ? Number(item) : item;
    if (typeof n === "number" && Number.isSafeInteger(n) && n > 0) seen.add(n);
    if (seen.size === MAX_CATEGORIES) break;
  }
  return [...seen];
});

/** Missing or nothing recognisable: the default. An explicit empty list or "all": every status. */
const statuses = z.unknown().optional().transform((raw): BottleStatus[] => {
  if (raw === undefined || raw === null) return [...DEFAULT_FIELD_STATUSES];
  if (raw === "all" || (Array.isArray(raw) && raw.length === 0)) return [];
  const seen = new Set<BottleStatus>();
  for (const item of items(raw)) {
    const value = typeof item === "string" ? (item.trim() as BottleStatus) : null;
    if (value !== null && BOTTLE_STATUSES.includes(value)) seen.add(value);
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_FIELD_STATUSES];
});

const schema = z.object({
  q: z
    .unknown()
    .optional()
    .transform((raw) => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 80) : "")),
  categoryIds,
  statuses,
  opened: z.enum(["any", "open", "sealed"]).catch("any"),
  tasted: z.enum(["any", "tasted", "untasted"]).catch("any"),
});

/** Filters from anything (a search-params object, JSON, junk): bounded, defaulted, and never throwing. */
export function parseFieldFilters(raw: unknown): FieldFilters {
  const source = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  return schema.parse(source);
}

/** The words of a search, each to be matched on its own. */
export const searchWords = (q: string): string[] => q.split(" ").filter((w) => w !== "");
