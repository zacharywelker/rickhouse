import type { FieldGroup } from "@/db/schema";

/**
 * The field matrix of the add-bottle redesign (design record sections 7 and 8) as data. Phase 3 only records it and
 * compares it with what the form rules do today (`field-matrix.test.ts` lists the differences); phase 4 changes the
 * rules to match it.
 *
 * A cell is "A" (always shown for this group), "N" (never shown) or "C" (shown under a condition the record spells
 * out: only the aged, only American, only mezcal…). Conditional cells are listed, not asserted.
 */
export type Cell = "A" | "N" | "C";

/** The nine field groups, in the order the record's tables use them. */
export const MATRIX_GROUPS: ReadonlyArray<FieldGroup> = ["whiskey", "rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur", "other"];

export type MatrixRow = {
  /** The record's name for the row. */
  label: string;
  /**
   * The form field it is, for every group; or a map when the field differs by group (the Aged toggle is `isAgedGin` for
   * gin and `isAged` for amaro and liqueur). A group missing from the map, or `null`, means the form has no such field
   * yet (barrel type, the rum Aged toggle).
   */
  field: string | null | Partial<Record<FieldGroup, string | null>>;
  cells: Record<FieldGroup, Cell>;
  /** Why a cell is not as the record's table says, when the owner changed the answer afterwards. */
  note?: string;
};

const row = (label: string, field: MatrixRow["field"], cells: string, note?: string): MatrixRow => ({
  label,
  field,
  cells: Object.fromEntries(MATRIX_GROUPS.map((group, index) => [group, cells.replace(/\s/g, "")[index] as Cell])) as Record<FieldGroup, Cell>,
  ...(note ? { note } : {}),
});

// Columns:                                              whiskey rum agave brandy gin vodka amaro liqueur other
/** Section 7: what a label shows. */
export const LABEL_MATRIX: ReadonlyArray<MatrixRow> = [
  row("Proof, ABV", "proof", "A A A A A A A A A"),
  row("Cask strength", "isCaskStrength", "A C N A N N N N A", "Off for agave and gin (owner, 2026-11-23)."),
  row("Bottled in Bond", "isBottledInBond", "C N N N N N N N N"),
  row("Straight", "isStraight", "C N N N N N N N N"),
  row("Aged toggle", { gin: "isAgedGin", amaro: "isAged", liqueur: "isAged", rum: null }, "N A N N A N A A N"),
  row("Age years", "ageYears", "A C C A C N C C A"),
  row("Age months", "ageMonths", "A C C A C N C C A"),
  row("Age days", "ageDays", "A C C A C N N N A"),
  row("Age statement", "ageStatement", "A C C A N N C C A"),
  row("NAS", "isNas", "A C N C C N C C A"),
  row("Distilled / filled date", "barrelFilledOn", "A C N A N N N N A"),
  row("Bottled date", "bottledOn", "A C N A N N N N A"),
  row("Solera", "isSolera", "N C N N N N N N N"),
  row("Solera low and high age", "soleraRange", "N C N N N N N N N"),
  row("Barrel type", null, "C N A N C N N N N", "Whiskey: Corn and Light only. Agave: not Madurado en Vidrio. Gin: when aged."),
  row("Non-chill filtered", "isNonChillFiltered", "A N N N N N N N N"),
  row("Additive free", "isAdditiveFree", "C N C N N N N N N"),
  row("Entry proof", "entryProof", "C N N N N N N N N"),
  row("Peat", "peatStatus", "C N N N N N N N N"),
  row("Cooperage", "cooperageId", "A N N N N N N N N", "Every whiskey, Scotch included (owner, 2026-11-23)."),
  row("Still type", "stillType", "A A A A A A A A A"),
  row("Dairy", "dairyStatus", "N N N N N N N A N"),
  row("Amaro style", "amaroStyle", "N N N N N N A N N"),
  row("Tequila class", "tequilaClass", "N N C N N N N N N"),
  row("Brandy designation", "brandyGrade", "N N N C N N N N N"),
  row("Gin style", "ginStyle", "N N N N C N N N N"),
  row("Marque", "marque", "N A N N N N N N N"),
  row("Esters", "esterGl", "N A N N N N N N N"),
  row("Added sugar", "sugarGPerL", "N C N N N N N N N"),
  // Retired from every form (section 4).
  row("Still proof", "isStillProof", "N N N N N N N N N", "Retired."),
  row("Chill filtered", "isChillFiltered", "N N N N N N N N N", "Retired."),
  row("Colour added", "colorAdded", "N N N N N N N N N", "Retired."),
  row("Char level", "charLevel", "N N N N N N N N N", "Retired."),
  row("Country (amaro, liqueur)", "originCountry", "N N N N N N N N N", "Retired: the distillery supplies it."),
  row("Region (amaro, liqueur)", "originRegion", "N N N N N N N N N", "Retired: the distillery supplies it."),
];

/** Section 8: what a bottle shows. */
export const BOTTLE_MATRIX: ReadonlyArray<MatrixRow> = [
  row("Batch (Lot # for agave)", "batch", "A A A A A N N N A"),
  row("Release year", "releaseYear", "A A A A A N N N A"),
  row("Single barrel", "isSingleBarrel", "A C A A C N N N A"),
  row("Private selection", "isSingleBarrelPick", "A C A A C N N N A"),
  row("Pick name", "pickName", "A C A A C N N N A"),
  row("Picked by", "pickedBy", "A C A A C N N N A"),
  row("Barrel number", "barrelNumber", "A C A A C N N N A"),
  row("Warehouse", "warehouse", "C N N N N N N N N"),
  row("Rick / floor", "rickFloor", "C N N N N N N N N"),
  row("Proof override", "proof", "A A A A A A N N A"),
  row("Distilled / filled date", "barrelFilledOn", "A C N A N N N N A"),
  row("Bottled date", "bottledOn", "A C N A N N N N A"),
  row("Age years", "ageYears", "A C C A C N N N A"),
  row("Age months", "ageMonths", "A C C A C N N N A"),
  row("Age days", "ageDays", "A C C A C N N N A"),
  row("Age statement", "ageStatement", "A C C A C N N N A"),
  row("Tequila class", "tequilaClass", "N N C N N N N N N"),
  row("Gin NAS", "ginIsNas", "N N N N C N N N N"),
  row("Brandy designation", "brandyGrade", "N N N N N N N N N", "Off the bottle; the label keeps it (section 4)."),
  row("Bottle count", "bottleCount", "N N N N N N N N N", "Retired."),
  row("Size override", "sizeMl", "A A A A A A A A A"),
];
