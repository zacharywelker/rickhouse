import type { DuplicateKind } from "./duplicate-kinds";

/** The question a dismissal answers, by kind: "are these two the same thing?" */
export const duplicateScope = (kind: DuplicateKind) => `duplicate:${kind}`;

/** A pair as one string, the lower id first, so a pair is the same pair whichever way round it was seen. */
export function pairKey(aId: number, bId: number): string {
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}
