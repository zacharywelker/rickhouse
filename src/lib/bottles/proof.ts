/**
 * Proof and ABV are the same number two ways: proof is double the ABV,
 * without a percentage sign; ABV is half the proof, with one (SPEC #12).
 * Pure so the two directions can be tested without a form around them.
 */

/** Rounds to the column's two decimal places and drops float noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "" when blank or not a real number — the caller decides what that means. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function proofToAbv(proof: string): string {
  const n = toNumber(proof);
  return n === null ? "" : String(round2(n / 2));
}

export function abvToProof(abv: string): string {
  const n = toNumber(abv);
  return n === null ? "" : String(round2(n * 2));
}
