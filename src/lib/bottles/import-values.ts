import { ACQUISITIONS, BOTTLE_STATUSES, type Acquisition, type BottleStatus } from "@/db/schema";

/**
 * The bottle-level values of one import row, read the way people actually
 * keep spreadsheets ("$54.99", "50%", "yes", "107 proof") rather than only
 * the way the export writes them. Pure, so the rules are testable without a
 * database.
 *
 * Anything that cannot be read falls back to the column's default and is
 * named in `ignored`, so the import report says what was dropped instead of
 * the bottle quietly arriving with different values than the file had.
 */
export type ImportedBottleValues = {
  pricePaid: string | null;
  dateAcquired: string | null;
  acquisition: Acquisition;
  status: BottleStatus;
  fillPct: number;
  isOpen: boolean;
  ignored: string[];
};

/** "$1,299.00", "107 proof", "50%", "93°" -> the number; blank -> null; unreadable -> undefined. */
export function readNumber(value: string): string | null | undefined {
  const text = value.trim();
  if (text === "") return null;
  const n = Number(text.replace(/[$,%°]|proof/gi, "").trim());
  return Number.isFinite(n) ? String(n) : undefined;
}

const TRUE = new Set(["true", "yes", "y", "1", "open", "opened"]);
const FALSE = new Set(["false", "no", "n", "0", "sealed", "closed"]);

function isRealIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
}

export function readBottleValues(row: Record<string, string | undefined>): ImportedBottleValues {
  const ignored: string[] = [];
  const cell = (key: string) => (row[key] ?? "").trim();
  const drop = (key: string, why: string) => ignored.push(`${key} "${cell(key)}" (${why})`);

  const price = readNumber(cell("price_paid"));
  if (price === undefined) drop("price_paid", "not a number");

  const date = cell("date_acquired");
  const dateAcquired = date !== "" && isRealIsoDate(date) ? date : null;
  if (date !== "" && dateAcquired === null) drop("date_acquired", "use YYYY-MM-DD");

  const acquisitionText = cell("acquisition").toLowerCase();
  const acquisition = (ACQUISITIONS as readonly string[]).includes(acquisitionText)
    ? (acquisitionText as Acquisition)
    : "purchase";
  if (acquisitionText !== "" && acquisition !== acquisitionText) drop("acquisition", "unknown, used purchase");

  const statusText = cell("status").toLowerCase();
  const status = (BOTTLE_STATUSES as readonly string[]).includes(statusText) ? (statusText as BottleStatus) : "owned";
  if (statusText !== "" && status !== statusText) drop("status", "unknown, used owned");

  // A blank level is a full bottle. Number("") is 0, which used to import
  // every bottle from a spreadsheet without this column as empty.
  const fill = readNumber(cell("fill_pct"));
  if (fill === undefined) drop("fill_pct", "not a number, used 100");
  const fillPct = fill == null ? 100 : Math.min(100, Math.max(0, Math.round(Number(fill))));

  const openText = cell("is_open").toLowerCase();
  if (openText !== "" && !TRUE.has(openText) && !FALSE.has(openText)) drop("is_open", "use true or false");
  // Same rule as the bottle form, both ways: an Open status means the bottle
  // is open, and an open bottle that is merely owned is Open.
  const isOpen = TRUE.has(openText) || status === "open";

  return {
    pricePaid: price ?? null,
    dateAcquired,
    acquisition,
    status: isOpen && status === "owned" ? "open" : status,
    fillPct,
    isOpen,
    ignored,
  };
}
