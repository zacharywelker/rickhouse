import { ageInYears, agaveClassFromYears, brandyGradeFromStatement, brandyGradeFromYears, MANUAL_AGAVE_CLASSES, UNDER_A_YEAR_CLASSES, brandyGradesFor, isAgaveKind } from "./spirit-details";
import type { CategoryKind } from "./rules";

const AGE_FIELDS = ["ageYears", "ageMonths", "ageDays"];

/**
 * What a typed age or age statement settles, as the label form does it: an age sets an agave's class (a Joven or Cristalino
 * stays as typed) and a Cognac's, Armagnac's or Calvados's designation; a statement that names a designation sets it where
 * no age speaks. Only the field just changed triggers it, so the owner can still choose differently afterwards.
 */
export function withDerivedDesignation<T extends Record<string, unknown>>(next: T, changed: string, kind: CategoryKind | null): T {
  // A Blanco or Reposado has no years (the field is hidden, though what was typed there may linger): they do not count.
  const underAYear = isAgaveKind(kind) && UNDER_A_YEAR_CLASSES.includes(String(next.tequilaClass ?? ""));
  const years = ageInYears(underAYear ? "" : next.ageYears, next.ageMonths, next.ageDays);
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

/**
 * What the Calvados appellation asks of the rest of the label, as a note (the law's rules are warnings, never blocks): Pays
 * d'Auge is distilled in a pot still, Domfrontais in a column still and is aged at least three years. Null when nothing is off.
 */
export function appellationNote(values: Record<string, unknown>): string | null {
  const still = String(values.stillType ?? "");
  const years = ageInYears(values.ageYears, values.ageMonths, values.ageDays);
  if (values.calvadosAppellation === "pays-d-auge" && still !== "" && still !== "pot") return "Pays d'Auge is distilled in a pot still.";
  if (values.calvadosAppellation === "domfrontais") {
    if (still !== "" && still !== "column") return "Domfrontais is distilled in a column still.";
    if (years !== null && years < 3) return "Domfrontais is aged at least 3 years.";
  }
  return null;
}
