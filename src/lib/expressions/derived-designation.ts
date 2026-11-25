import { ageInYears, agaveClassFromYears, brandyGradeFromStatement, brandyGradeFromYears, MANUAL_AGAVE_CLASSES, brandyGradesFor, isAgaveKind } from "./spirit-details";
import type { CategoryKind } from "./rules";

const AGE_FIELDS = ["ageYears", "ageMonths", "ageDays"];

/**
 * What a typed age or age statement settles, as the label form does it: an age sets an agave's class (a Joven or Cristalino
 * stays as typed) and a Cognac's, Armagnac's or Calvados's designation; a statement that names a designation sets it where
 * no age speaks. Only the field just changed triggers it, so the owner can still choose differently afterwards.
 */
export function withDerivedDesignation<T extends Record<string, unknown>>(next: T, changed: string, kind: CategoryKind | null): T {
  const years = ageInYears(next.ageYears, next.ageMonths, next.ageDays);
  if (isAgaveKind(kind) && AGE_FIELDS.includes(changed) && years !== null && !MANUAL_AGAVE_CLASSES.includes(String(next.tequilaClass ?? ""))) {
    const derived = agaveClassFromYears(kind, years);
    return derived && derived !== next.tequilaClass ? { ...next, tequilaClass: derived } : next;
  }
  if (brandyGradesFor(kind).length > 0 && (AGE_FIELDS.includes(changed) || changed === "ageStatement")) {
    const derived = AGE_FIELDS.includes(changed)
      ? years !== null ? brandyGradeFromYears(kind, years) : null
      : brandyGradeFromStatement(kind, String(next.ageStatement ?? ""));
    // Hors d'Âge shares XO's minimum, so an age alone cannot tell them apart: a chosen Hors d'Âge stays.
    if (next.brandyGrade === "Hors d'Âge" && derived === "XO") return next;
    return derived && derived !== next.brandyGrade ? { ...next, brandyGrade: derived } : next;
  }
  return next;
}
