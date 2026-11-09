/**
 * What the Finishes field shows and sends, kept out of the component so it can be tested.
 * Rows are the form's `LinkedRow`s; the unfinished portion is the row with `unfinished: true` (id 0).
 * The save path (`finish-pairs.ts`) is the authority on what is valid; totals here reuse it.
 */
import type { LinkedRow } from "@/components/expressions/ordered-picker";
import { resolveFinishPairs, type FinishRowInput } from "./finish-pairs";

export type PairLineState = { id: number; share: string };

const blank = (share: string) => share.trim() === "";

/** The mashbills a finish went on. With none recorded, the label's only mashbill, else none: no guessing. */
export function linesOf(row: LinkedRow, mashbillIds: number[]): PairLineState[] {
  if (row.mashbills) return row.mashbills.filter((line) => mashbillIds.includes(line.id));
  return mashbillIds.length === 1 ? [{ id: mashbillIds[0]!, share: row.share ?? "" }] : [];
}

const sumOf = (lines: PairLineState[]): string =>
  lines.length === 0 || lines.some((line) => blank(line.share)) ? "" : String(lines.reduce((sum, line) => sum + Number(line.share), 0));

/** The row with these lines; its own share is the line's share, or the lines' total. */
export function withLines(row: LinkedRow, lines: PairLineState[]): LinkedRow {
  return { ...row, mashbills: lines, share: lines.length === 1 ? lines[0]!.share : sumOf(lines) };
}

/** A finish just added: on the first mashbill when there are several, so the dropdown never starts empty. */
export function addFinishRow(row: LinkedRow, mashbillIds: number[]): LinkedRow {
  return mashbillIds.length >= 2 ? withLines(row, [{ id: mashbillIds[0]!, share: "" }]) : row;
}

/** Every row with explicit lines, and a lone unfinished share filled with what the finishes leave. */
export function effectiveRows(rows: LinkedRow[], mashbillIds: number[]): LinkedRow[] {
  const explicit = rows.map((row) => withLines(row, linesOf(row, mashbillIds)));
  const others = explicit.filter((row) => !row.unfinished).flatMap((row) => row.mashbills!);
  return explicit.map((row) => {
    if (!row.unfinished || row.mashbills!.length !== 1 || !blank(row.mashbills![0]!.share)) return row;
    if (others.length === 0 || others.some((line) => blank(line.share))) return row;
    const left = 100 - others.reduce((sum, line) => sum + Number(line.share), 0);
    return left > 0 ? withLines(row, [{ ...row.mashbills![0]!, share: String(left) }]) : row;
  });
}

export type Totals = {
  /** Any share has been typed. While false, blank shares are fine and nothing is flagged. */
  started: boolean;
  total: number;
  /** A sentence for the person, or null. */
  error: string | null;
  /** Each mashbill's share, present only when every share is filled and adds to 100. */
  mashbillShares: Record<number, number>;
};

export function totalsOf(rows: LinkedRow[], mashbillIds: number[]): Totals {
  const inputs: FinishRowInput[] = effectiveRows(rows, mashbillIds).map((row) => ({
    finishId: row.unfinished ? null : row.id,
    share: null,
    mashbills: row.mashbills!.map((line) => ({ mashbillId: line.id, share: blank(line.share) ? null : Math.round(Number(line.share)) })),
  }));
  const resolved = resolveFinishPairs(mashbillIds, inputs);
  const typed = inputs.flatMap((row) => row.mashbills!).flatMap((line) => (line.share === null ? [] : [line.share]));
  return {
    started: typed.length > 0,
    total: typed.reduce((sum, share) => sum + share, 0),
    error: resolved.errors[0] ?? null,
    mashbillShares: Object.fromEntries(resolved.mashbillShares),
  };
}
