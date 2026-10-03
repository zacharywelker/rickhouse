/**
 * Older names a label or a distillery has gone by, typed one per line:
 *
 *   Old Grand-Dad Bonded (1980–1995)
 *   Old Grand-Dad 100 (from 1996)
 *   Hirsch (until 1985)
 *   Plain Old Name
 *
 * The years in brackets are optional and for display only. Pure, so the label
 * form, the admin form and the tests share one reading of the text.
 */

export type OtherName = { name: string; yearFrom: number | null; yearTo: number | null };

export const MAX_OTHER_NAMES = 30;
const MAX_NAME_LENGTH = 160;

const YEARS = /\(\s*(?:(\d{4})\s*[-–—]\s*(\d{4})?|until\s+(\d{4})|from\s+(\d{4})|(\d{4}))\s*\)\s*$/i;

export type ParsedOtherNames = { names: OtherName[]; error: string | null };

/** Reads the typed lines. Blank lines and repeats are dropped; a bad line is an error, not a guess. */
export function parseOtherNames(text: string | null | undefined): ParsedOtherNames {
  const names: OtherName[] = [];
  const seen = new Set<string>();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let name = trimmed;
    let yearFrom: number | null = null;
    let yearTo: number | null = null;
    const match = YEARS.exec(trimmed);
    if (match) {
      name = trimmed.slice(0, match.index).trim();
      if (match[1] !== undefined) {
        yearFrom = Number(match[1]);
        yearTo = match[2] !== undefined ? Number(match[2]) : null;
      } else if (match[3] !== undefined) yearTo = Number(match[3]);
      else if (match[4] !== undefined) yearFrom = Number(match[4]);
      else if (match[5] !== undefined) {
        yearFrom = Number(match[5]);
        yearTo = yearFrom;
      }
    }
    if (name === "") return { names: [], error: `"${trimmed}" has years but no name.` };
    if (name.length > MAX_NAME_LENGTH) return { names: [], error: `Keep each name under ${MAX_NAME_LENGTH} characters.` };
    if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
      return { names: [], error: `"${name}" ends before it starts — check the years.` };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push({ name, yearFrom, yearTo });
  }
  if (names.length > MAX_OTHER_NAMES) return { names: [], error: `At most ${MAX_OTHER_NAMES} other names.` };
  return { names, error: null };
}

/** "1980–1995", "from 1996", "until 1985", "1990", or "" with no years. */
export function yearsText(name: Pick<OtherName, "yearFrom" | "yearTo">): string {
  const { yearFrom, yearTo } = name;
  if (yearFrom !== null && yearTo !== null) return yearFrom === yearTo ? String(yearFrom) : `${yearFrom}–${yearTo}`;
  if (yearFrom !== null) return `from ${yearFrom}`;
  if (yearTo !== null) return `until ${yearTo}`;
  return "";
}

/** The name with its years, as shown beside a label or distillery. */
export function nameWithYears(name: OtherName): string {
  const years = yearsText(name);
  return years === "" ? name.name : `${name.name} (${years})`;
}

/** The inverse of `parseOtherNames`, for loading a form. */
export function otherNamesText(names: ReadonlyArray<OtherName>): string {
  return names.map(nameWithYears).join("\n");
}
