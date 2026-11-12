import type { FieldGroup } from "@/db/schema";
import { isGinKind } from "./gin-details";
import type { CategoryKind } from "./rules";
import { BRANDY_MINIMUM_YEARS, hidesWarehouse, isAgaveKind } from "./spirit-details";

/** What the rule needs to know of the bottle's label. */
export type LabelFacts = { group: FieldGroup | null; kind: CategoryKind; isAgedGin: boolean; tequilaClass: string | null };

/**
 * Why a bottle field does not apply to a bottle of this label, or null when it does. The bottle form's own rules
 * (the old Bulk add applied them row by row, and so does the sheet): a gin has no barrel unless it is aged, tequila has no age
 * statement, a blanco has no age at all, and so on. `own` is what the bottle itself says (its own tequila class, say).
 */
export function bottleFieldNotUsed(name: string, label: LabelFacts, own: { tequilaClass?: string | null } = {}): string | null {
  const { group, kind } = label;
  if ((name === "barrelFilledOn" || name === "bottledOn") && (isAgaveKind(kind) || isGinKind(kind))) return "Not used for this spirit";
  if ((name === "warehouse" || name === "rickFloor") && hidesWarehouse(group ?? "", kind)) return "Not used for this spirit";
  if (isGinKind(kind) && !label.isAgedGin && ["isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "bottleCount", "ageYears", "ageMonths", "ageDays", "ginIsNas"].includes(name)) return "Only for aged gin";
  if (name === "ginIsNas" && !isGinKind(kind)) return "Only for gin";
  if (name === "tequilaClass" && kind !== "tequila") return "Only for tequila";
  if (name === "brandyGrade" && !BRANDY_MINIMUM_YEARS[kind]) return "No defined grade for this category";
  if (name === "ageStatement" && (kind === "tequila" || isGinKind(kind))) return "No age statement field for this spirit";
  if (["ageYears", "ageMonths", "ageDays"].includes(name) && kind === "tequila" && (own.tequilaClass || label.tequilaClass) === "blanco") return "Blanco has no age field";
  return null;
}
