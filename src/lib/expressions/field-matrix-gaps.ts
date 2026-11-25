import type { GapGroup } from "./field-matrix-check";

/**
 * Where today's form rules differ from the field matrix (`field-matrix.ts`), as phase 3 found them on 2026-11-24.
 * `field-matrix.test.ts` requires this list to equal what `matrixGaps()` finds, so fixing a rule (phase 4) fails the
 * test until its entry is deleted here, and a rule that starts to disagree fails it until the entry is added.
 *
 * Phase 4A closed every entry: the rules by kind, the bottle rules, the retired fields, the Still field, the rum Aged toggle
 * and Barrel type. The list is empty on purpose; a rule that starts to disagree with the matrix fails the test until its entry is added.
 */
export const KNOWN_GAPS: ReadonlyArray<GapGroup & { phase4: string }> = [
];
