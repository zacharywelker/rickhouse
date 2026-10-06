/**
 * Known releases of a label, typed one per line. Everything after the name is
 * optional and separated by `|`, in a fixed order:
 *
 *   name | year | proof | age | msrp
 *
 *   2024-01 Springfield | 2024 | 124.6 | 7y 2m 3d | 99.99
 *   Bourbon War | 2020 | | 4
 *   Batch C923
 *
 * Age is "7y 2m 3d" (any of the parts), a bare number of years, or any other
 * text, kept as the age statement. Pure, so the label form and the tests share
 * one reading of the text.
 */

export type Release = {
  name: string;
  releaseYear: number | null;
  proof: string | null;
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
  ageStatement: string | null;
  msrp: string | null;
};

export const MAX_RELEASES = 100;
const MAX_NAME_LENGTH = 160;

const AGE_PARTS = /^(?:(\d+(?:\.\d)?)\s*y)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*d)?$/i;

type Parsed<T> = { value: T; error: null } | { value: null; error: string };

function parseAge(text: string): Parsed<Pick<Release, "ageYears" | "ageMonths" | "ageDays" | "ageStatement">> {
  const none = { ageYears: null, ageMonths: null, ageDays: null, ageStatement: null };
  if (text === "") return { value: none, error: null };
  if (/^\d+(?:\.\d)?$/.test(text)) {
    if (Number(text) > 100) return { value: null, error: `"${text}" is not a believable age.` };
    return { value: { ...none, ageYears: text }, error: null };
  }
  const parts = AGE_PARTS.exec(text);
  if (parts && (parts[1] || parts[2] || parts[3])) {
    if (Number(parts[1] ?? 0) > 100) return { value: null, error: `"${text}" is not a believable age.` };
    return {
      value: {
        ...none,
        ageYears: parts[1] ?? null,
        ageMonths: parts[2] ? Number(parts[2]) : null,
        ageDays: parts[3] ? Number(parts[3]) : null,
      },
      error: null,
    };
  }
  if (text.length > 200) return { value: null, error: "Keep each age under 200 characters." };
  return { value: { ...none, ageStatement: text }, error: null };
}

function parseDecimal(text: string, what: string, max: number): Parsed<string | null> {
  const cleaned = text.replace(/^\$/, "").replace(/°$/, "").trim();
  if (cleaned === "") return { value: null, error: null };
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned) || Number(cleaned) > max) {
    return { value: null, error: `"${text}" is not a ${what}.` };
  }
  return { value: cleaned, error: null };
}

export type ParsedReleases = { releases: Release[]; error: string | null };

/** Reads the typed lines. Blank lines and repeated names are dropped; a bad line is an error, not a guess. */
export function parseReleases(text: string | null | undefined): ParsedReleases {
  const releases: Release[] = [];
  const seen = new Set<string>();
  for (const line of (text ?? "").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length > 5) return { releases: [], error: `"${line.trim()}" has more than five parts.` };
    const [name = "", year = "", proofText = "", ageText = "", msrpText = ""] = cells;
    if (name === "") return { releases: [], error: `"${line.trim()}" has no name.` };
    if (name.length > MAX_NAME_LENGTH) return { releases: [], error: `Keep each name under ${MAX_NAME_LENGTH} characters.` };

    let releaseYear: number | null = null;
    if (year !== "") {
      if (!/^\d{4}$/.test(year) || Number(year) < 1700 || Number(year) > 2200) {
        return { releases: [], error: `"${year}" is not a year (${name}).` };
      }
      releaseYear = Number(year);
    }
    const proof = parseDecimal(proofText, "proof", 200);
    if (proof.error) return { releases: [], error: `${proof.error} (${name})` };
    const age = parseAge(ageText);
    if (age.error) return { releases: [], error: `${age.error} (${name})` };
    const msrp = parseDecimal(msrpText, "price", 99_999_999);
    if (msrp.error) return { releases: [], error: `${msrp.error} (${name})` };

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    releases.push({ name, releaseYear, proof: proof.value, ...age.value!, msrp: msrp.value });
  }
  if (releases.length > MAX_RELEASES) return { releases: [], error: `At most ${MAX_RELEASES} releases.` };
  return { releases, error: null };
}

/** "7y 2m 3d", the statement, or "". */
export function releaseAgeText(r: Pick<Release, "ageYears" | "ageMonths" | "ageDays" | "ageStatement">): string {
  const parts = [
    r.ageYears !== null ? `${Number(r.ageYears)}y` : "",
    r.ageMonths !== null ? `${r.ageMonths}m` : "",
    r.ageDays !== null ? `${r.ageDays}d` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : (r.ageStatement ?? "");
}

/** One release as a line `parseReleases` reads back; trailing blanks dropped. */
export function releaseLine(r: Release): string {
  const cells = [
    r.name,
    r.releaseYear !== null ? String(r.releaseYear) : "",
    r.proof !== null ? String(Number(r.proof)) : "",
    releaseAgeText(r),
    r.msrp !== null ? String(Number(r.msrp)) : "",
  ];
  while (cells.length > 1 && cells.at(-1) === "") cells.pop();
  // An empty cell is "| |", not "|  |".
  return cells.map((cell, i) => (i === 0 ? cell : cell === "" ? " |" : ` | ${cell}`)).join("");
}

/** The inverse of `parseReleases`, for loading a form. */
export function releasesText(releases: ReadonlyArray<Release>): string {
  return releases.map(releaseLine).join("\n");
}

/** The name with its year, as a choice on the bottle form: "2024-01 Springfield (2024)". */
export function releaseLabel(r: Pick<Release, "name" | "releaseYear">): string {
  return r.releaseYear !== null && !r.name.includes(String(r.releaseYear)) ? `${r.name} (${r.releaseYear})` : r.name;
}
