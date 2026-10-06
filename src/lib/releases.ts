/**
 * Known releases of a label, as the label form's rows and the release page's
 * form submit them: one object per release, every value a string as typed.
 * Pure, so both forms, the server and the tests share one reading.
 *
 * A row carries the release's id once it exists, so renaming a release edits
 * it in place rather than replacing it — bottles, its photo and its notes all
 * hang off that id.
 */

export type Release = {
  name: string;
  releaseYear: number | null;
  proof: string | null;
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
  /** Wording only; not shown on the forms, but kept when they save. */
  ageStatement: string | null;
  msrp: string | null;
};

/** A release as submitted: its id when it already exists. */
export type ReleaseInput = Release & { id: number | null };

/** What the forms hold for one release. */
export type ReleaseRow = {
  id: string;
  name: string;
  year: string;
  proof: string;
  ageYears: string;
  ageMonths: string;
  ageDays: string;
  ageStatement: string;
  msrp: string;
};

export const MAX_RELEASES = 100;
const MAX_NAME_LENGTH = 160;

type Parsed<T> = { value: T; error: null } | { value: null; error: string };
const ok = <T,>(value: T): Parsed<T> => ({ value, error: null });
const fail = <T,>(error: string): Parsed<T> => ({ value: null, error });

function decimal(text: string, what: string, max: number, places: number): Parsed<string | null> {
  const cleaned = text.replace(/^\$/, "").trim();
  if (cleaned === "") return ok(null);
  const shape = new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`);
  if (!shape.test(cleaned) || Number(cleaned) > max) return fail(`"${text}" is not ${what}.`);
  return ok(cleaned);
}

function whole(text: string, what: string, max: number): Parsed<number | null> {
  const cleaned = text.trim();
  if (cleaned === "") return ok(null);
  if (!/^\d+$/.test(cleaned) || Number(cleaned) > max) return fail(`"${text}" is not ${what}.`);
  return ok(Number(cleaned));
}

/** One row, checked. Errors name the release so a list of them reads clearly. */
export function parseReleaseRow(row: Partial<ReleaseRow>): Parsed<ReleaseInput> {
  const name = (row.name ?? "").trim();
  if (name === "") return fail("Every release needs a name.");
  if (name.length > MAX_NAME_LENGTH) return fail(`Keep each name under ${MAX_NAME_LENGTH} characters.`);
  const named = (error: string) => fail<ReleaseInput>(`${error} (${name})`);

  const idText = (row.id ?? "").trim();
  const id = /^\d+$/.test(idText) ? Number(idText) : null;

  let releaseYear: number | null = null;
  const year = (row.year ?? "").trim();
  if (year !== "") {
    if (!/^\d{4}$/.test(year) || Number(year) < 1700 || Number(year) > 2200) return named(`"${year}" is not a year.`);
    releaseYear = Number(year);
  }
  const proof = decimal(row.proof ?? "", "a proof", 200, 2);
  if (proof.error) return named(proof.error);
  const ageYears = decimal(row.ageYears ?? "", "a number of years", 100, 1);
  if (ageYears.error) return named(ageYears.error);
  const ageMonths = whole(row.ageMonths ?? "", "a number of months", 1200);
  if (ageMonths.error) return named(ageMonths.error);
  const ageDays = whole(row.ageDays ?? "", "a number of days", 40000);
  if (ageDays.error) return named(ageDays.error);
  const msrp = decimal(row.msrp ?? "", "a price", 99_999_999, 2);
  if (msrp.error) return named(msrp.error);
  const ageStatement = (row.ageStatement ?? "").trim().slice(0, 200) || null;

  return ok({
    id,
    name,
    releaseYear,
    proof: proof.value,
    ageYears: ageYears.value,
    ageMonths: ageMonths.value,
    ageDays: ageDays.value,
    ageStatement,
    msrp: msrp.value,
  });
}

export type ParsedReleases = { releases: ReleaseInput[]; error: string | null };

/** The label form's rows, sent as JSON. Rows with no name are skipped; a bad row is an error, not a guess. */
export function parseReleaseRows(raw: string | null | undefined): ParsedReleases {
  let rows: unknown;
  try {
    rows = JSON.parse(raw ?? "[]");
  } catch {
    return { releases: [], error: "The releases could not be read." };
  }
  if (!Array.isArray(rows)) return { releases: [], error: "The releases could not be read." };
  const releases: ReleaseInput[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const shaped = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? value : ""]),
    ) as Partial<ReleaseRow>;
    if ((shaped.name ?? "").trim() === "") continue;
    const parsed = parseReleaseRow(shaped);
    if (parsed.error !== null) return { releases: [], error: parsed.error };
    const key = parsed.value.name.toLowerCase();
    if (seen.has(key)) return { releases: [], error: `Two releases are both called "${parsed.value.name}".` };
    seen.add(key);
    releases.push(parsed.value);
  }
  if (releases.length > MAX_RELEASES) return { releases: [], error: `At most ${MAX_RELEASES} releases.` };
  return { releases, error: null };
}

/** One stored release as the forms' row of strings. */
export function releaseRow(r: Release & { id: number }): ReleaseRow {
  return {
    id: String(r.id),
    name: r.name,
    year: r.releaseYear !== null ? String(r.releaseYear) : "",
    proof: r.proof !== null ? String(Number(r.proof)) : "",
    ageYears: r.ageYears !== null ? String(Number(r.ageYears)) : "",
    ageMonths: r.ageMonths !== null ? String(r.ageMonths) : "",
    ageDays: r.ageDays !== null ? String(r.ageDays) : "",
    ageStatement: r.ageStatement ?? "",
    msrp: r.msrp !== null ? String(Number(r.msrp)) : "",
  };
}

/** The name with its year, as a choice on the bottle form: "2024-01 Springfield (2024)". */
export function releaseLabel(r: Pick<Release, "name" | "releaseYear">): string {
  return r.releaseYear !== null && !r.name.includes(String(r.releaseYear)) ? `${r.name} (${r.releaseYear})` : r.name;
}
