/**
 * The rows of the data-sheet look (design: 2026-11-25-data-sheet-forms-design.md), from the mockup `00-data-sheet-layout.png`.
 * Only fields and tokens the form already draws: a field or token named here is drawn in that row; a field the section has that
 * is named in no row is drawn in a row of its own at the end, so a new field is never lost. Tokens: "@proof" Proof and ABV,
 * "@age" the years / months / days group, "@dates" the two dates with their age helper, "@tier" Navy Strength or Overproof.
 * A row draws only the fields this spirit has (the form's rules decide), and no row at all when it has none.
 */
export type SheetRowSpec = { label: string; items: ReadonlyArray<string> };

export const SHEET_LAYOUT: Readonly<Record<string, ReadonlyArray<SheetRowSpec>>> = {
  // One panel, in the mockup's order: the identity and strength sections together.
  label: [
    { label: "Name", items: ["brandId", "name", "categoryId", "slug"] },
    { label: "Strength", items: ["proof", "isCaskStrength", "isBottledInBond", "@tier", "isStraight"] },
    { label: "Size and price", items: ["sizeMl", "msrp", "upc"] },
    { label: "Age", items: ["tequilaClass", "brandyGrade", "isAgedGin", "isAged", "ageYears", "ageStatement", "isNas", "barrelFilledOn", "bottledOn", "@dates"] },
    { label: "Aging", items: ["tropicalYears", "continentalYears", "isSolera", "soleraLowYears", "soleraHighYears"] },
  ],
};

/** The sections the "label" panel stands for, which the data-sheet look draws as that one panel. */
export const LABEL_PANEL_SECTIONS: ReadonlyArray<string> = ["identity", "strength"];

/** What a chip says, where the mockup words it differently from the form's field label ("+ UPC", "Statement", "+ Bottled date"). */
export const CHIP_LABELS: Readonly<Record<string, string>> = {
  upc: "UPC",
  ageStatement: "Statement",
  barrelFilledOn: "Distilled / filled date",
  bottledOn: "Bottled date",
};

/** The fields a section's layout names, tokens left out. */
export const layoutFields = (sectionId: string): string[] =>
  (SHEET_LAYOUT[sectionId] ?? []).flatMap((row) => row.items).filter((item) => !item.startsWith("@"));
