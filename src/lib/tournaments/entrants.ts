import type { Entrant, MashbillInput } from "./types";

/** One of a label's mashbills as the database gives it: grain shares arrive as numeric strings. */
export type MashbillRow = {
  name: string | null;
  isGeneric: boolean;
  isSecret: boolean;
  grains: { grain: string; percent: string | number }[];
};

/**
 * What the database knows about an entry, before it is made into an `Entrant`: the bottle's own values over its
 * release's over its label's (the data layer resolves that), the label's lists, and its category's field group.
 */
export type EntryFacts = {
  proof: string | number | null;
  ageYears: string | number | null;
  ageMonths: number | null;
  ageDays: number | null;
  fieldGroup: string | null;
  distilleries: string[];
  finishes: string[];
  mashbills: MashbillRow[];
};

export type EntryKind = "bottle" | "label" | "adhoc";

type EntryIds = { bottleId: number | null; expressionId: number | null };

/** A bottle entry has its bottle, a label entry only its label, an ad hoc entry neither. */
export function entryKind(entry: EntryIds): EntryKind {
  return entry.bottleId !== null ? "bottle" : entry.expressionId !== null ? "label" : "adhoc";
}

/** The id the ranking knows an entry by across tournaments, or null for an ad hoc entry, which is never ranked. */
export function competitorId(entry: EntryIds): string | null {
  return entry.bottleId !== null ? `b:${entry.bottleId}` : entry.expressionId !== null ? `e:${entry.expressionId}` : null;
}

const present = (text: string | null): string | null => (text !== null && text.trim() !== "" ? text.trim() : null);

/** A bottle as it reads in a tournament: brand and label, then what marks it (pick, barrel, release or batch). */
export function entryDisplayName(parts: {
  brand: string;
  name: string;
  pickName: string | null;
  barrelNumber: string | null;
  releaseName: string | null;
  batch: string | null;
}): string {
  const base = `${parts.brand} ${parts.name}`;
  const pick = present(parts.pickName);
  if (pick) return `${base} “${pick}”`;
  const barrel = present(parts.barrelNumber);
  if (barrel) return `${base} (barrel ${barrel})`;
  const release = present(parts.releaseName);
  if (release) return `${base} (${release})`;
  const batch = present(parts.batch);
  if (batch) return `${base} (batch ${batch})`;
  return base;
}

/** A database numeric string (or number) as a number, or null when it is missing or not a number. */
export function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Years, with months and days added in, or null when none of the three is recorded. */
function ageInYears(years: string | number | null, months: number | null, days: number | null): number | null {
  const y = toNumber(years);
  if (y === null && months === null && days === null) return null;
  return Math.round(((y ?? 0) + (months ?? 0) / 12 + (days ?? 0) / 365.25) * 100) / 100;
}

function mashbillInput(rows: MashbillRow[], fieldGroup: string | null): MashbillInput | null {
  if (fieldGroup !== "whiskey" || rows.length === 0) return null;
  if (rows.length > 1) return { kind: "blend" };
  const row = rows[0]!;
  if (row.isGeneric) return { kind: "generic", style: row.name ?? "" };
  return {
    kind: "recipe",
    name: row.isSecret ? row.name : null,
    grains: row.grains.flatMap((g) => {
      const percent = toNumber(g.percent);
      return percent === null ? [] : [{ grain: g.grain, percent }];
    }),
  };
}

/** An entry as the grouping sees it. A value the data does not give, or gives badly, is unknown (null). */
export function buildEntrant(id: number, name: string, facts: EntryFacts): Entrant {
  return {
    id,
    name,
    proof: toNumber(facts.proof),
    mashbill: mashbillInput(facts.mashbills, facts.fieldGroup),
    distilleries: facts.distilleries,
    ageYears: ageInYears(facts.ageYears, facts.ageMonths, facts.ageDays),
    finishes: facts.finishes,
  };
}
