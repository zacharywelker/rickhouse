import { formatNumeric } from "@/lib/utils";

/** "12y", "4y 3m", "10y 2m 14d" — or null when no age is recorded. */
export function describeAgeParts(years: string | null, months: number | string | null, days: number | string | null): string | null {
  const parts = [
    [years, "y"],
    [months, "m"],
    [days, "d"],
  ]
    .filter(([value]) => value !== null && value !== "" && Number(value) !== 0)
    .map(([value, unit]) => `${formatNumeric(String(value))}${unit}`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * How an age reads wherever it is shown: the years, months and days when any
 * are recorded ("4y 6m"), otherwise the statement as printed, otherwise
 * nothing. The parts win because they are the measured age; a statement such
 * as "Straight (at least 2 years)" is only ever a floor.
 */
export function ageLabel(e: {
  ageStatement: string | null;
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
}): string | null {
  return describeAgeParts(e.ageYears, e.ageMonths, e.ageDays) ?? (e.ageStatement || null);
}
