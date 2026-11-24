import type { GapGroup } from "./field-matrix-check";

/**
 * Where today's form rules differ from the field matrix (`field-matrix.ts`), as phase 3 found them on 2026-11-24.
 * `field-matrix.test.ts` requires this list to equal what `matrixGaps()` finds, so fixing a rule (phase 4) fails the
 * test until its entry is deleted here, and a rule that starts to disagree fails it until the entry is added.
 *
 * Phase 4A (wave A) removed the entries for the rules by kind and for the bottle rules, which now live in
 * `bottleFieldNotUsed` (the bottle form and the bulk editor both ask it). What is left is the retired fields, the
 * rum Aged toggle, Barrel type and the Still link.
 */
export const KNOWN_GAPS: ReadonlyArray<GapGroup & { phase4: string }> = [
  { matrix: "label", row: "Aged toggle", expected: "A", found: "no-field", groups: ["rum"], phase4: "Add the Aged toggle to rum (section 9, Rum); it also drives the bottle's rum fields and the rum cells the check cannot evaluate yet." },
  { matrix: "label", row: "Barrel type", expected: "A", found: "no-field", groups: ["agave"], phase4: "Add Barrel type for agave (the Finish data renamed on the page; not Madurado en Vidrio), Corn and Light whiskey, and aged gin." },
  { matrix: "label", row: "Still type", expected: "A", found: "hidden", groups: ["whiskey", "agave", "brandy", "gin", "vodka", "amaro", "liqueur", "other"], phase4: "Show the optional Still link under More for every spirit; today only the rum section has it." },
  { matrix: "label", row: "Still proof", expected: "N", found: "shown", groups: ["agave"], phase4: "Retired: take Still proof out of the agave form (the column stays dormant)." },
  { matrix: "label", row: "Country (amaro, liqueur)", expected: "N", found: "shown", groups: ["amaro", "liqueur"], phase4: "Retired: take Country out of the amaro and liqueur forms; the distillery supplies it." },
  { matrix: "label", row: "Region (amaro, liqueur)", expected: "N", found: "shown", groups: ["amaro", "liqueur"], phase4: "Retired: take Region out of the amaro and liqueur forms; the distillery supplies it." },
  { matrix: "bottle", row: "Brandy designation", expected: "N", found: "mixed", groups: ["brandy"], detail: ["brandy: shown for cognac, armagnac, calvados"], phase4: "Retired from the bottle: the label keeps VS / VSOP / XO (section 4)." },
  { matrix: "bottle", row: "Bottle count", expected: "N", found: "shown", groups: ["whiskey", "rum", "agave", "brandy", "vodka", "amaro", "liqueur", "other"], phase4: "Retired: take Bottle count out of every bottle form." },
  { matrix: "bottle", row: "Bottle count", expected: "N", found: "mixed", groups: ["gin"], detail: ["gin: shown for gin (aged), genever (aged)"], phase4: "Retired: take Bottle count out of every bottle form." },
];
