/** Bottle rows from docs/superpowers/specs/2026-11-23-add-bottle-redesign/data-sheet.html: Bought and Which one. */
export type BottleRowSpec = { label: string; items: ReadonlyArray<string> };

/** The @status token draws the bottle's status controls in Which one. */
export const BOTTLE_SHEET_ROWS: ReadonlyArray<BottleRowSpec> = [
  { label: "Label", items: ["expressionId", "expressionNameId"] },
  { label: "Bought", items: ["pricePaid", "storeId", "dateAcquired", "acquisition", "location"] },
  { label: "Which one", items: ["releaseId", "batch", "releaseYear", "@status"] },
];

export type BottleMoreItem = { id: string; label: string; fields: ReadonlyArray<string> };

/** The mockup's More line reveals single-barrel details, notes and bottle overrides. */
export const BOTTLE_SHEET_MORE: ReadonlyArray<BottleMoreItem> = [
  { id: "single", label: "Single barrel", fields: ["isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber"] },
  { id: "warehouse", label: "Warehouse / rick", fields: ["warehouse", "rickFloor"] },
  { id: "notes", label: "Notes", fields: ["notes"] },
  { id: "differs", label: "This bottle differs from the label", fields: ["sizeMl", "proof", "barrelFilledOn", "bottledOn", "ageYears", "ageStatement", "ginIsNas", "tequilaClass"] },
];

export const BOTTLE_MORE_FIELDS: string[] = BOTTLE_SHEET_MORE.flatMap((item) => item.fields);

/** What a chip says where the mockup words it differently from the field's label. */
export const BOTTLE_CHIP_LABELS: Readonly<Record<string, string>> = {
  pricePaid: "Price",
  storeId: "Store",
  dateAcquired: "Acquired",
  location: "Where it lives",
  releaseId: "Vintage",
  releaseYear: "Year",
  batch: "Batch",
};

/** The fields the rows name, tokens left out. */
export const bottleRowFields = (): string[] =>
  BOTTLE_SHEET_ROWS.flatMap((row) => row.items).filter((item) => !item.startsWith("@"));
