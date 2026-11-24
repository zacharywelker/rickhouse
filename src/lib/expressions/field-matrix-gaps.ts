import type { GapGroup } from "./field-matrix-check";

/**
 * Where today's form rules differ from the field matrix (`field-matrix.ts`), as phase 3 found them on 2026-11-24.
 * `field-matrix.test.ts` requires this list to equal what `matrixGaps()` finds, so fixing a rule (phase 4) fails the
 * test until its entry is deleted here, and a rule that starts to disagree fails it until the entry is added.
 */
export const KNOWN_GAPS: ReadonlyArray<GapGroup & { phase4: string }> = [
  { matrix: "label", row: "Cask strength", expected: "N", found: "shown", groups: ["agave"], phase4: "Hide Cask strength for agave and gin (owner, 2026-11-23)." },
  { matrix: "label", row: "Cask strength", expected: "N", found: "mixed", groups: ["gin"], detail: ["gin: shown for gin (aged), genever (aged)"], phase4: "Hide Cask strength for agave and gin (owner, 2026-11-23)." },
  { matrix: "label", row: "Aged toggle", expected: "A", found: "no-field", groups: ["rum"], phase4: "Add the Aged toggle to rum (section 9, Rum); it also drives the bottle's rum fields." },
  { matrix: "label", row: "Barrel type", expected: "A", found: "no-field", groups: ["agave"], phase4: "Add Barrel type for agave (the Finish data renamed on the page; not Madurado en Vidrio), Corn and Light whiskey, and aged gin." },
  { matrix: "label", row: "Cooperage", expected: "A", found: "mixed", groups: ["whiskey"], detail: ["whiskey: hidden for scotch"], phase4: "Show Cooperage for Scotch too: every whiskey has it (owner)." },
  { matrix: "label", row: "Still type", expected: "A", found: "hidden", groups: ["whiskey", "agave", "brandy", "gin", "vodka", "amaro", "liqueur", "other"], phase4: "Show the optional Still link under More for every spirit; today only the rum section has it." },
  { matrix: "label", row: "Still proof", expected: "N", found: "shown", groups: ["agave"], phase4: "Retired: take Still proof out of the agave form (the column stays dormant)." },
  { matrix: "label", row: "Country (amaro, liqueur)", expected: "N", found: "shown", groups: ["amaro", "liqueur"], phase4: "Retired: take Country out of the amaro and liqueur forms; the distillery supplies it." },
  { matrix: "label", row: "Region (amaro, liqueur)", expected: "N", found: "shown", groups: ["amaro", "liqueur"], phase4: "Retired: take Region out of the amaro and liqueur forms; the distillery supplies it." },
  { matrix: "bottle", row: "Batch (Lot # for agave)", expected: "A", found: "in-component", groups: ["all"], phase4: "Move the bottle form's field rules into bottleFieldNotUsed so the matrix can test them (vodka, amaro and liqueur have no batch)." },
  { matrix: "bottle", row: "Release year", expected: "A", found: "in-component", groups: ["all"], phase4: "Move the bottle form's field rules into bottleFieldNotUsed so the matrix can test them (vodka, amaro and liqueur have no release year)." },
  { matrix: "bottle", row: "Single barrel", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Private selection", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Pick name", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Picked by", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Barrel number", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Warehouse", expected: "N", found: "shown", groups: ["other"], phase4: "Hide Warehouse for Other; keep it for American, Japanese, International and Flavored whiskey only." },
  { matrix: "bottle", row: "Rick / floor", expected: "N", found: "shown", groups: ["other"], phase4: "Hide Rick / floor for Other; keep it for American, Japanese, International and Flavored whiskey only." },
  { matrix: "bottle", row: "Proof override", expected: "A", found: "in-component", groups: ["all"], phase4: "Move the rule into bottleFieldNotUsed: no proof override for amaro and liqueur (bottle-form.tsx hides it in the component)." },
  { matrix: "bottle", row: "Distilled / filled date", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Bottled date", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Age years", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Age months", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Age days", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Age statement", expected: "N", found: "shown", groups: ["vodka", "amaro", "liqueur"], phase4: "Mark not used for vodka, amaro and liqueur in bottleFieldNotUsed (the bottle form hides some of these in the component)." },
  { matrix: "bottle", row: "Brandy designation", expected: "N", found: "mixed", groups: ["brandy"], detail: ["brandy: shown for cognac, armagnac, calvados"], phase4: "Retired from the bottle: the label keeps VS / VSOP / XO (section 4)." },
  { matrix: "bottle", row: "Bottle count", expected: "N", found: "shown", groups: ["whiskey", "rum", "agave", "brandy", "vodka", "amaro", "liqueur", "other"], phase4: "Retired: take Bottle count out of every bottle form." },
  { matrix: "bottle", row: "Bottle count", expected: "N", found: "mixed", groups: ["gin"], detail: ["gin: shown for gin (aged), genever (aged)"], phase4: "Retired: take Bottle count out of every bottle form." },
  { matrix: "bottle", row: "Size override", expected: "A", found: "in-component", groups: ["all"], phase4: "Move the rule into bottleFieldNotUsed; it is shown for every spirit." },
];
