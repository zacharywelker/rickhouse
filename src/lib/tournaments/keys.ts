import { mashbillKey, type Comparable } from "./grains";
import type { Entrant, GroupKey } from "./types";

/** Proof is compared in bands this many points wide: a point or two of proof is no difference to a palate. */
export const PROOF_BAND = 5;
/** Age is compared in bands this many years wide. */
export const AGE_BAND_YEARS = 2;

type KeyValue = { band: Comparable; exact: Comparable } | null;

/** A number the data gives, or null when it is missing or not finite (a NaN would break the sort). */
const finite = (n: number | null): number | null => (n !== null && Number.isFinite(n) ? n : null);

/** The label's distilleries, trimmed, with blanks dropped and spellings that differ only in case merged (first kept). */
export function distilleryNames(entrant: Entrant): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of entrant.distilleries) {
    const name = raw.trim();
    if (name !== "" && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }
  return names;
}

/** What one key says about an entrant, or null when it is unknown (which sorts after every known value). */
export function keyValue(entrant: Entrant, key: GroupKey): KeyValue {
  switch (key) {
    case "proof": {
      const proof = finite(entrant.proof);
      return proof === null ? null : { band: [Math.floor(proof / PROOF_BAND)], exact: [proof] };
    }
    case "mashbill":
      return mashbillKey(entrant.mashbill);
    case "distillery": {
      const names = distilleryNames(entrant);
      if (names.length === 0) return null;
      // Names sort first, alphabetically; a label with several distilleries is its own group after them.
      if (names.length > 1) return { band: [1, ""], exact: [1, ""] };
      const name = names[0]!.toLowerCase();
      return { band: [0, name], exact: [0, name] };
    }
    case "age": {
      const age = finite(entrant.ageYears);
      return age === null ? null : { band: [Math.floor(age / AGE_BAND_YEARS)], exact: [age] };
    }
    case "finish": {
      const first = entrant.finishes[0]?.trim().toLowerCase();
      return first ? { band: [first], exact: [first] } : null;
    }
  }
}

function compareComparable(a: Comparable, b: Comparable): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

function compareValues(a: KeyValue, b: KeyValue, part: "band" | "exact"): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compareComparable(a[part], b[part]);
}

/**
 * The entrants in similarity order: by each key's band in priority order, then by the exact values in the same order,
 * then by entry id. The same entrants always give the same order, which is what makes "reset to automatic" repeatable.
 */
export function sortEntrants(entrants: readonly Entrant[], order: readonly GroupKey[]): Entrant[] {
  const keyed = entrants.map((entrant) => ({ entrant, values: order.map((key) => keyValue(entrant, key)) }));
  keyed.sort((a, b) => {
    for (const part of ["band", "exact"] as const) {
      for (let i = 0; i < order.length; i++) {
        const c = compareValues(a.values[i]!, b.values[i]!, part);
        if (c !== 0) return c;
      }
    }
    return a.entrant.id - b.entrant.id;
  });
  return keyed.map((k) => k.entrant);
}
