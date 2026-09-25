import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Money arrives from Postgres `numeric` as a string. Format it without ever
 * round-tripping through a float (SPEC: Conventions).
 */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const cents = `${fraction}00`.slice(0, 2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${cents}`;
}

/** Trims Postgres numeric padding: "108.00" -> "108", "54.50" -> "54.5". */
export function formatNumeric(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Enum-ish text columns are stored lowercase ("purchase", "owned", "pot").
 * Presenting them raw makes the UI look like a database dump.
 */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Calendar dates (acquired, opened, tasted) arrive from Postgres `date` as
 * "YYYY-MM-DD". Parsed by hand rather than through `new Date()`, which reads a
 * bare date as UTC midnight and shows the day before anywhere west of Greenwich.
 */
function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

/** "2024-04-20" -> "Apr 20, 2024". A field guide, not a database dump. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseIsoDate(value);
  if (!date || date.month < 1 || date.month > 12) return value;
  return `${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

/**
 * How long ago a calendar date was, in the one unit that matters at that
 * distance: "today", "3 days ago", "5 months ago", "2 years ago". Whole units,
 * rounded down — a bottle bought 23 months ago has not been owned for 2 years.
 * `today` is injectable so tests do not depend on the clock.
 */
export function timeSince(value: string | null | undefined, today: Date = new Date()): string | null {
  if (!value) return null;
  const date = parseIsoDate(value);
  if (!date) return null;
  const now = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
  const days = Math.round(
    (Date.UTC(now.year, now.month - 1, now.day) - Date.UTC(date.year, date.month - 1, date.day)) / 86_400_000,
  );
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  let months = (now.year - date.year) * 12 + (now.month - date.month);
  if (now.day < date.day) months -= 1;
  if (months < 1) return days < 14 ? `${days} days ago` : `${Math.floor(days / 7)} weeks ago`;
  if (months < 12) return months === 1 ? "a month ago" : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "a year ago" : `${years} years ago`;
}
