import type { GapGroup } from "./field-matrix-check";

/**
 * Where today's form rules differ from the field matrix (`field-matrix.ts`), as phase 3 found them on 2026-11-24.
 * `field-matrix.test.ts` requires this list to equal what `matrixGaps()` finds, so fixing a rule (phase 4) fails the
 * test until its entry is deleted here, and a rule that starts to disagree fails it until the entry is added.
 *
 * Phase 4A (wave A) removed the entries for the rules by kind and for the bottle rules, which now live in
 * `bottleFieldNotUsed` (the bottle form and the bulk editor both ask it). What is left is Barrel type (phase 4A: waves A and B did
 * the rules, the retired fields and the Still field; the rum Aged toggle is wave C's first half).
 */
export const KNOWN_GAPS: ReadonlyArray<GapGroup & { phase4: string }> = [
  { matrix: "label", row: "Barrel type", expected: "A", found: "no-field", groups: ["agave"], phase4: "Add Barrel type for agave (the Finish data renamed on the page; not Madurado en Vidrio), Corn and Light whiskey, and aged gin." },
];
