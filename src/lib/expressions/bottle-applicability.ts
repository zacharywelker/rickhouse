import type { FieldGroup } from "@/db/schema";
import { isGinKind } from "./gin-details";
import type { CategoryKind } from "./rules";
import { BRANDY_MINIMUM_YEARS, UNDER_A_YEAR_CLASSES, hidesWarehouse, isAgaveKind } from "./spirit-details";

/** What the rule needs to know of the bottle's label. */
export type LabelFacts = { group: FieldGroup | null; kind: CategoryKind; isAgedGin: boolean; tequilaClass: string | null; /** Rum, amaro and liqueur: the label's Aged toggle. */ isAged?: boolean };

/**
 * Why a bottle field does not apply to a bottle of this label, or null when it does. The bottle form's own rules
 * (the Bulk editor applies them row by row): a gin has no barrel unless it is aged, tequila has no age
 * statement, a blanco has no age at all, and so on. `own` is what the bottle itself says (its own tequila class, say).
 */
export function bottleFieldNotUsed(name: string, label: LabelFacts, own: { tequilaClass?: string | null } = {}): string | null {
  const { group, kind } = label;
  if ((group === "vodka" || group === "amaro" || group === "liqueur") && ["batch", "releaseYear", "releaseId", "isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "barrelFilledOn", "bottledOn", "ageYears", "ageMonths", "ageDays", "ageStatement"].includes(name)) return "Not used for this spirit";
  if (name === "proof" && (group === "amaro" || group === "liqueur")) return "Not used for this spirit";
  if (name === "releaseId" && isGinKind(kind)) return "Not used for this spirit";
  if (name === "releaseId" && kind === "tequila") return "Only for mezcal";
  if ((name === "barrelFilledOn" || name === "bottledOn") && (isAgaveKind(kind) || isGinKind(kind))) return "Not used for this spirit";
  if ((name === "warehouse" || name === "rickFloor") && hidesWarehouse(group ?? "", kind)) return "Not used for this spirit";
  if (isGinKind(kind) && !label.isAgedGin && ["isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "bottleCount", "ageYears", "ageMonths", "ageDays", "ginIsNas"].includes(name)) return "Only for aged gin";
  if (group === "rum" && !label.isAged && ["isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "barrelFilledOn", "bottledOn", "ageYears", "ageMonths", "ageDays", "ageStatement"].includes(name)) return "Only for aged rum";
  if (name === "ginIsNas" && !isGinKind(kind)) return "Only for gin";
  if (name === "tequilaClass" && !isAgaveKind(kind)) return "Only for tequila and mezcal";
  if (name === "brandyGrade" && !BRANDY_MINIMUM_YEARS[kind]) return "No defined grade for this category";
  if (name === "ageStatement" && (kind === "tequila" || isGinKind(kind))) return "No age statement field for this spirit";
  if (name === "ageYears" && isAgaveKind(kind) && UNDER_A_YEAR_CLASSES.includes(own.tequilaClass || label.tequilaClass || "")) return "Blanco and Reposado are under a year";
  if (["ageYears", "ageMonths", "ageDays", "ageStatement"].includes(name) && kind === "mezcal" && (own.tequilaClass || label.tequilaClass) === "madurado-en-vidrio") return "Madurado en Vidrio has no age";
  if (name === "ageDays" && isGinKind(kind)) return "Gin is aged in years and months";
  return null;
}
