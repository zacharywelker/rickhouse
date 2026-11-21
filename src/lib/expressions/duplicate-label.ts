/**
 * What the New Label form starts with when a label is duplicated: everything that describes the product, with the name
 * left blank (the copy is named by the person; a slug made from the old name would be wrong) and nothing that belongs to
 * the original: its ids, owner, dates and photo. Its bottles, approvals, other names and vintages are never copied.
 */
const BELONGS_TO_THE_ORIGINAL = ["id", "ownerId", "slug", "createdAt", "updatedAt", "photoPath", "photoThumbPath", "photoIsCutout"] as const;

export function duplicateLabelValues(source: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = { ...source, name: "" };
  for (const key of BELONGS_TO_THE_ORIGINAL) delete values[key];
  return values;
}
