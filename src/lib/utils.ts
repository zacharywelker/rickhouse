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
