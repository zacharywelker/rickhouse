/**
 * Marking a bottle a single barrel or a private selection says its proof and age are its own, not the label's: a blend of
 * barrels has its own proof, and it would be wrong as the default of every later bottle of the label. These are the values
 * that describe the liquid and so move to the bottle; the size, and everything else, stay with the label.
 */
export const LIQUID_FIELDS: ReadonlyArray<string> = ["proof", "ageYears", "ageMonths", "ageDays", "ageStatement", "tequilaClass", "brandyGrade"];

/**
 * Splits a new row's label-scoped cells by who they are for. When the row is marked (and Undo has not asked to keep them
 * on the label) the liquid values go to the bottle. Nothing is stored for a new row, so un-marking it simply routes
 * them back to the label the next time it is split.
 */
export function routeLiquid(cells: Readonly<Record<string, string>>, marked: boolean, keepOnLabel: boolean): { label: Record<string, string>; bottle: Record<string, string> } {
  const label: Record<string, string> = {};
  const bottle: Record<string, string> = {};
  for (const [field, value] of Object.entries(cells)) {
    if (marked && !keepOnLabel && LIQUID_FIELDS.includes(field)) bottle[field] = value;
    else label[field] = value;
  }
  return { label, bottle };
}
