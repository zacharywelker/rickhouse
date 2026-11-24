import type { GapGroup } from "./field-matrix-check";

/**
 * Where today's form rules differ from the field matrix (`field-matrix.ts`), as phase 3 found them on 2026-11-24.
 * `field-matrix.test.ts` requires this list to equal what `matrixGaps()` finds, so fixing a rule (phase 4) fails the
 * test until its entry is deleted here, and a rule that starts to disagree fails it until the entry is added.
 *
 * Entries marked "in-component" are bottle rules that live in the bottle form component: they cannot be asked of a
 * function, so they are untested rather than wrong (the component already matches the matrix for batch, release
 * year, proof override and size override). Entries for vodka, amaro and liqueur differ only in `bottleFieldNotUsed`,
 * which the bulk editor reads; the bottle form itself already hides them.
 */
export const KNOWN_GAPS: ReadonlyArray<GapGroup & { phase4: string }> = [
  { matrix: "label", row: "Cask strength", expected: "N", found: "shown", groups: ["agave"], phase4: "Hide Cask strength for agave and gin (owner, 2026-11-23)." },
  { matrix: "label", row: "Cask strength", expected: "N", found: "mixed", groups: ["gin"], detail: ["gin: shown for gin (aged), genever (aged)"], phase4: "Hide Cask strength for agave and gin (owner, 2026-11-23)." },
  { matrix: "label", row: "Aged toggle", expected: "A", found: "no-field", groups: ["rum"], phase4: "Add the Aged toggle to rum (section 9, Rum); it also drives the bottle's rum fields and the rum cells the check cannot evaluate yet." },
  { matrix: "label", row: "Barrel type", expected: "A", found: "no-field", groups: ["agave"], phase4: "Add Barrel type for agave (the Finish data renamed on the page; not Madurado en Vidrio), Corn and Light whiskey, and aged gin." },
  { matrix: "label", row: "Cooperage", expected: "A", found: "mixed", groups: ["whiskey"], detail: ["whiskey: hidden for scotch"], phase4: "Show Cooperage for Scotch too: every whiskey has it (owner)." },
  { matrix: "label", row: "Still type", expected: "A", found: "hidden", groups: ["whiskey", "agave", "brandy", "gin", "vodka", "amaro", "liqueur", "other"], phase4: "Show the optional Still link under More for every spirit; today only the rum section has it." },
  { matrix: "label", row: "Still proof", expected: "N", found: "shown", groups: ["agave"], phase4: "Retired: take Still proof out of the agave form (the column stays dormant)." },
  { matrix: "label", row: "Country (amaro, liqueur)", expected: "N", found: "shown", groups: ["amaro", "liqueur"], phase4: "Retired: take Country out of the amaro and liqueur forms; the distillery supplies it." },
  { matrix: "label", row: "Region (amaro, liqueur)", expected: "N", found: "shown", groups: ["amaro", "liqueur"], phase4: "Retired: take Region out of the amaro and liqueur forms; the distillery supplies it." },
  { matrix: "label", row: "Peat", expected: "A", found: "mixed", groups: ["whiskey"], detail: ["whiskey: hidden for japanese, international"], phase4: "Show Peat for Japanese and International whisky, and for American Single Malt, which needs a key finer than the kind (section 6)." },
  { matrix: "label", row: "NAS", expected: "N", found: "mixed", groups: ["brandy"], detail: ["brandy: shown for cognac, armagnac, calvados"], phase4: "Hide NAS for Cognac, Armagnac and Calvados (section 9: no NAS); keep it for Pisco, Apple Brandy and Eau de Vie." },
  { matrix: "bottle", row: "Batch (Lot # for agave)", expected: "A", found: "in-component", groups: ["all"], phase4: "Nothing to change in the form: bottle-form.tsx already hides batch for vodka, amaro and liqueur. Not testable until the rule moves into bottleFieldNotUsed (phase 4, with the bulk editor)." },
  { matrix: "bottle", row: "Release year", expected: "A", found: "in-component", groups: ["all"], phase4: "Nothing to change in the form (bottle-form.tsx already matches). Not testable until the rule moves into bottleFieldNotUsed." },
  { matrix: "bottle", row: "Single barrel", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Private selection", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Pick name", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Picked by", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Barrel number", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Warehouse", expected: "N", found: "shown", groups: ["other"], phase4: "Hide Warehouse for Other; keep it for American, Japanese, International and Flavored whiskey only." },
  { matrix: "bottle", row: "Rick / floor", expected: "N", found: "shown", groups: ["other"], phase4: "Hide Rick / floor for Other; keep it for American, Japanese, International and Flavored whiskey only." },
  { matrix: "bottle", row: "Proof override", expected: "A", found: "in-component", groups: ["all"], phase4: "Nothing to change in the form (bottle-form.tsx:166 already hides it for amaro and liqueur). Not testable until the rule moves into bottleFieldNotUsed." },
  { matrix: "bottle", row: "Distilled / filled date", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Bottled date", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Age years", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Age months", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Age days", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Age statement", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "The bottle form already hides this for vodka, amaro and liqueur (bottle-form.tsx:150-166); only bottleFieldNotUsed, which the bulk editor reads, does not. Mark it not used there." },
  { matrix: "bottle", row: "Vintage choice", expected: "A", found: "in-component", groups: ["all"], phase4: "Mezcal only for agave: tequila and gin lose the vintage choice (section 8). The rule lives in the bottle form component; move it into bottleFieldNotUsed." },
  { matrix: "bottle", row: "Brandy designation", expected: "N", found: "mixed", groups: ["brandy"], detail: ["brandy: shown for cognac, armagnac, calvados"], phase4: "Retired from the bottle: the label keeps VS / VSOP / XO (section 4)." },
  { matrix: "bottle", row: "Bottle count", expected: "N", found: "shown", groups: ["whiskey", "rum", "agave", "brandy", "vodka", "amaro", "liqueur", "other"], phase4: "Retired: take Bottle count out of every bottle form." },
  { matrix: "bottle", row: "Bottle count", expected: "N", found: "mixed", groups: ["gin"], detail: ["gin: shown for gin (aged), genever (aged)"], phase4: "Retired: take Bottle count out of every bottle form." },
  { matrix: "bottle", row: "Size override", expected: "A", found: "in-component", groups: ["all"], phase4: "Nothing to change in the form. Not testable until the rule moves into bottleFieldNotUsed." },
];
