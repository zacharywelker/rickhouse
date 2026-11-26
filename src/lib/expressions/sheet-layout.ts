/**
 * The rows of the data-sheet look (design: 2026-11-25-data-sheet-forms-design.md), from the mockup `00-data-sheet-layout.png`.
 * Only fields and tokens the form already draws: a field or token named here is drawn in that row; a field the section has that
 * is named in no row is drawn in a row of its own at the end, so a new field is never lost. Tokens: "@proof" Proof and ABV,
 * "@age" the years / months / days group, "@dates" the two dates with their age helper, "@tier" Navy Strength or Overproof.
 * A row draws only the fields this spirit has (the form's rules decide), and no row at all when it has none.
 */
export type SheetRowSpec = { label: string; items: ReadonlyArray<string> };

export const SHEET_LAYOUT: Readonly<Record<string, ReadonlyArray<SheetRowSpec>>> = {
  identity: [
    { label: "Name", items: ["brandId", "name", "categoryId", "slug"] },
    { label: "Size and price", items: ["sizeMl", "msrp", "upc"] },
    { label: "Description", items: ["description"] },
  ],
  strength: [
    { label: "Strength", items: ["proof", "isCaskStrength", "isBottledInBond", "@tier", "isStraight"] },
    { label: "Age", items: ["tequilaClass", "brandyGrade", "isAgedGin", "isAged", "ageYears", "ageStatement", "isNas", "@dates"] },
    { label: "Aging", items: ["tropicalYears", "continentalYears", "isSolera", "soleraLowYears", "soleraHighYears"] },
  ],
};

/** The fields a section's layout names, tokens left out. */
export const layoutFields = (sectionId: string): string[] =>
  (SHEET_LAYOUT[sectionId] ?? []).flatMap((row) => row.items).filter((item) => !item.startsWith("@"));
