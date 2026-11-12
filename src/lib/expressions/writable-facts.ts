import type { FieldGroup } from "@/db/schema";
import { writableFields } from "./fields";
import type { CategoryKind } from "./rules";
import { isGinKind } from "./gin-details";
import { BRANDY_MINIMUM_YEARS, isAgaveKind } from "./spirit-details";

/**
 * The label facts a spirit can have: what a save of a label of that spirit writes, and so what the sheet lets a person
 * type. One rule, used by the server's patch and by the editor, so a cell is never editable where the save would drop it.
 * `kind` is the category's kind (bourbon, tequila, gin…), which narrows `fieldGroup` further for a few fields.
 */
export function writableLabelFacts(fieldGroup: FieldGroup | "other", kind: CategoryKind): Set<string> {
  const allowed = writableFields(fieldGroup);
  if (kind !== "tequila") allowed.delete("tequilaClass");
  if (!BRANDY_MINIMUM_YEARS[kind]) allowed.delete("brandyGrade");
  if (kind !== "gin") allowed.delete("ginStyle");
  // Aged gin is a gin's own flag, and a gin has no barrel dates or age statement.
  if (!isGinKind(kind)) allowed.delete("isAgedGin");
  if (isGinKind(kind)) {
    allowed.delete("barrelFilledOn");
    allowed.delete("bottledOn");
    allowed.delete("ageStatement");
  }
  if (isAgaveKind(kind)) {
    allowed.delete("barrelFilledOn");
    allowed.delete("bottledOn");
    allowed.delete("isNas");
  }
  if (kind === "tequila") allowed.delete("ageStatement");
  // Regions belong to Scotch (the web form only shows them there); anything sent for another kind is ignored.
  if (kind !== "scotch") allowed.delete("regions");
  return allowed;
}
