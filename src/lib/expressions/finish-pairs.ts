/**
 * Which finish went on which mashbill of a label, and each combination's share of the blend.
 * Pure: no database. The save path writes what this returns; the form shows the same totals.
 */

/** One row of the label's Finishes field. `finishId: null` is the unfinished portion. */
export type FinishRowInput = {
  finishId: number | null;
  share: number | null;
  /** One line per mashbill the finish went on. Omitted means the label's only mashbill when it has exactly one, and none otherwise; empty means none. */
  mashbills?: { mashbillId: number; share: number | null }[];
};

export type Pair = { mashbillId: number; finishId: number | null; share: number | null; position: number };

export type Resolved = {
  pairs: Pair[];
  /** Computed totals, present only when every pair has a share and nothing is wrong. */
  mashbillShares: Map<number, number>;
  finishShares: Map<number, number>;
  errors: string[];
};

export const FINISH_PAIR_TOTAL_MESSAGE = (diff: number): string =>
  diff > 0 ? `Shares add up to ${100 + diff}%: ${diff} over.` : `Shares add up to ${100 + diff}%: ${-diff} under.`;

/** Thrown by the save path when the pairs a caller sent cannot be stored; the message is meant for the person. */
export class FinishPairsInvalid extends Error {}

const NOT_ON_LABEL = "A finish names a mashbill that is not on this label.";
const SAME_PAIR = "A finish is listed twice on the same mashbill.";
const SAME_UNFINISHED = "The unfinished portion is listed twice on the same mashbill.";
const PARTIAL_SHARES = "Give every share a number, or leave them all blank.";

export function resolveFinishPairs(labelMashbillIds: number[], rows: FinishRowInput[]): Resolved {
  const empty: Resolved = { pairs: [], mashbillShares: new Map(), finishShares: new Map(), errors: [] };
  // A label with finishes but no mashbills is valid today and has nothing to pair.
  if (labelMashbillIds.length === 0) return empty;

  const errors = new Set<string>();
  const onLabel = new Set(labelMashbillIds);
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const row of rows) {
    // With several mashbills nothing says which one a finish went on, so no mashbill is guessed.
    const lines = row.mashbills ?? (labelMashbillIds.length === 1 ? [{ mashbillId: labelMashbillIds[0]!, share: row.share }] : []);
    for (const line of lines) {
      if (!onLabel.has(line.mashbillId)) { errors.add(NOT_ON_LABEL); continue; }
      const key = `${line.mashbillId}:${row.finishId ?? "none"}`;
      if (seen.has(key)) { errors.add(row.finishId === null ? SAME_UNFINISHED : SAME_PAIR); continue; }
      seen.add(key);
      pairs.push({ mashbillId: line.mashbillId, finishId: row.finishId, share: line.share, position: pairs.length });
    }
  }

  const given = pairs.filter((pair) => pair.share !== null);
  if (given.length > 0 && given.length < pairs.length) errors.add(PARTIAL_SHARES);
  if (given.length > 0 && given.length === pairs.length) {
    const total = given.reduce((sum, pair) => sum + pair.share!, 0);
    if (total !== 100) errors.add(FINISH_PAIR_TOTAL_MESSAGE(total - 100));
  }
  if (errors.size > 0) return { ...empty, errors: [...errors] };

  const resolved: Resolved = { pairs, mashbillShares: new Map(), finishShares: new Map(), errors: [] };
  if (pairs.length > 0 && given.length === pairs.length) {
    for (const pair of pairs) {
      resolved.mashbillShares.set(pair.mashbillId, (resolved.mashbillShares.get(pair.mashbillId) ?? 0) + pair.share!);
      if (pair.finishId !== null) resolved.finishShares.set(pair.finishId, (resolved.finishShares.get(pair.finishId) ?? 0) + pair.share!);
    }
  }
  return resolved;
}
