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
  row("Dairy", "dairyStatus", "N N N N N N N A N", "Under More for every liqueur, ticked by default on Cream (section 9)."),
  row("Amaro style", "amaroStyle", "N N N N N N A N N"),
  row("Tequila class", "tequilaClass", "N N C N N N N N N"),
  row("Brandy designation", "brandyGrade", "N N N C N N N N N"),
  row("Gin style", "ginStyle", "N N N N C N N N N"),
  row("Marque", "marque", "N A N N N N N N N"),
  row("Esters", "esterGl", "N A N N N N N N N"),
  row("Added sugar", "sugarGPerL", "N C N N N N N N N"),
  // Retired from every form (section 4).
  row("Regions", "regions", "C N N N N N N N N", "Scotch only. Shown by the form component, not by hiddenFields."),
  row("Cooking method", "cookingMethod", "N N C N N N N N N", "Agave, optional (tequila and mezcal)."),
  row("Extraction", "extraction", "N N C N N N N N N", "Agave, optional (tequila and mezcal)."),
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
  row("Age statement", "ageStatement", "A C C A N N N N A", "The record's table says aged gin; section 9 says no statement for gin, as on the label."),
  row("Vintage choice", "releaseId", "A A C A N N N N A", "Mezcal only for agave: tequila and gin lose it (section 8)."),
  row("Tequila class", "tequilaClass", "N N C N N N N N N"),
  row("Gin NAS", "ginIsNas", "N N N N C N N N N"),
  row("Brandy designation", "brandyGrade", "N N N N N N N N N", "Off the bottle; the label keeps it (section 4)."),
  row("Bottle count", "bottleCount", "N N N N N N N N N", "Retired."),
  row("Size override", "sizeMl", "A A A A A A A A A"),
];

/** Bottle fields every spirit has (section 8's first row, and Sealed / Opened and Label version). */
export const BOTTLE_ALWAYS_FIELDS: ReadonlyArray<string> = ["expressionId", "expressionNameId", "pricePaid", "storeId", "dateAcquired", "acquisition", "status", "location", "notes"];

/** Fields every spirit has, which the record's tables lump into one row. */
export const ALWAYS_FIELDS: ReadonlyArray<string> = ["brandId", "name", "categoryId", "slug", "msrp", "sizeMl", "upc", "description"];

/**
 * Form fields the record does not mention. They are not rows because the record is silent, so phase 4 decides:
 * rum's tropical and continental aging years (the record replaces rum aging with the Aged toggle and Solera).
 */
export const UNLISTED_FIELDS: Readonly<Record<string, string>> = {
  tropicalYears: "Not in the record; rum aging by climate, to decide in phase 4.",
  continentalYears: "Not in the record; rum aging by climate, to decide in phase 4.",
};

/**
 * Conditional ("C") cells the record spells out by kind, so they can be checked: for a label row, the kinds of the
 * group that show the field and the kinds that hide it. A condition that needs more than the kind (peat for American
 * Single Malt, rum's "when aged") is not listed here; see `UNDECIDABLE`.
 */
export type Condition = { row: string; group: FieldGroup; shown: ReadonlyArray<string>; hidden: ReadonlyArray<string> };

export const LABEL_CONDITIONS: ReadonlyArray<Condition> = [
  { row: "Bottled in Bond", group: "whiskey", shown: ["american"], hidden: ["canadian", "irish", "scotch", "japanese", "international", "flavored-whisky"] },
  { row: "Straight", group: "whiskey", shown: ["american"], hidden: ["canadian", "irish", "scotch", "japanese", "international", "flavored-whisky"] },
  { row: "Additive free", group: "whiskey", shown: ["canadian", "irish", "japanese", "international", "flavored-whisky"], hidden: ["american", "scotch"] },
  { row: "Additive free", group: "agave", shown: ["tequila", "mezcal"], hidden: [] },
  { row: "Entry proof", group: "whiskey", shown: ["american", "canadian", "irish", "japanese", "international", "flavored-whisky"], hidden: ["scotch"] },
  { row: "Peat", group: "whiskey", shown: ["irish", "scotch", "japanese", "international"], hidden: ["canadian", "flavored-whisky"] },
  { row: "NAS", group: "brandy", shown: ["pisco", "apple", "eau-de-vie"], hidden: ["cognac", "armagnac", "calvados"] },
  { row: "Age statement", group: "agave", shown: ["mezcal"], hidden: ["tequila"] },
  { row: "Tequila class", group: "agave", shown: ["tequila"], hidden: ["mezcal"] },
  { row: "Brandy designation", group: "brandy", shown: ["cognac", "armagnac", "calvados"], hidden: ["pisco", "apple", "eau-de-vie"] },
  { row: "Gin style", group: "gin", shown: ["gin"], hidden: ["genever"] },
];

/** Conditions the check cannot decide from the kind alone, and what they wait on. */
export const UNDECIDABLE: ReadonlyArray<{ row: string; why: string }> = [
  { row: "Peat", why: "American Single Malt is a subcategory of kind american, so peat for it needs a key finer than the kind (section 6)." },
  { row: "Cask strength", why: "Rum shows it only when aged, and rum has no Aged toggle yet." },
  { row: "Barrel type", why: "No such field yet." },
];
