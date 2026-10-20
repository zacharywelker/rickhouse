# Spirit-specific label and bottle facts

Confirmed by the collection owner on 2026-10-19. These rules apply to adding, editing, and reading labels and bottles on web and iOS. A bottle inherits its label's proof and age unless its own values override them.

## Tequila and mezcal

- Tequila class: Blanco, Joven, Reposado, Añejo, Extra Añejo, Cristalino. Show the class as age when no exact age is known. Joven and Cristalino have no inferred number.
- Show age guidance for Blanco (0–2 months), Reposado (2 months–1 year), Añejo (1–3 years), and Extra Añejo (3+ years). Guidance is not an exact age. Blanco has no editable numeric age. Tequila has no editable age statement or NAS.
- Tequila's maguey is fixed to Blue Weber. Mezcal and other agave categories use reusable, multiple maguey choices without percentages.
- Tequila and mezcal distillery choices come from Mexico. A Mexican distillery has a NOM field and appears as `NOM-____: Name`. DSP is available only to US distilleries.
- Hide distilled/barrel-filled and bottled dates on label and bottle. Keep Cooking Method, Extraction, and Additive Free. Remove the old Agave and Region text fields. Bottle Batch is labeled LOT #.
- Hide Warehouse and Rick / Floor from single-barrel details.

## Rum

- Linked producer choices are labeled Distilleries / Estates; remove the separate Estate text field.
- Base is a reusable multiple selection. Molasses, Sugarcane, and Honey are common choices. Other accepts a name and suggests names previously entered for other rum labels. No percentages.
- Hide Warehouse and Rick / Floor from single-barrel details.

## Brandy

- Distillate replaces Mashbill and permits multiple reusable fruit or variety names.
- Calvados accepts apple or pear distillates. Cognac and Armagnac accept grape distillates.
- Cognac, Armagnac, and Calvados distilleries are filtered to France. Pisco distilleries are filtered to Peru and Chile.
- VS, VSOP, and XO are offered only for categories with a defined minimum. The designation fills the display age statement; its minimum is guidance, not a measured age. Exact age is entered separately and takes precedence on display. Cognac minimums: 2/4/10 years; Armagnac: 1/4/10; Calvados: 2/4/6.
- Hide Warehouse and Rick / Floor from single-barrel details. Label and bottle offer the same designation choices; bottle fields inherit the label unless overridden.

## Gin and Genever

- Gin styles are London Dry, Old Tom, Contemporary, Plymouth, Holland-Style, and Other. Aged is a separate label switch. Genever is its own category under Gin and uses the same fields without a style selector.
- Botanicals and base spirits are reusable multiple selections. Juniper is included and cannot be removed. The shipped botanical and base choices live in `gin-details.ts` and `SpiritChoices.swift`; custom names can be added.
- Aged gin exposes numeric age in years, months, and days, NAS, and finishes. Gin has no editable age statement or distillation and bottling dates. NAS locks numeric age until deliberately unlocked, retaining the entered value.
- A bottle inherits whether its label is Aged, and inherits its label's age, NAS, and proof until its own values override them. It cannot change Aged on/off, botanicals, or bases. Only aged gin can have Single Barrel or Private Selection details. Warehouse and Rick / Floor are hidden.
- Navy Strength is inferred at 54% ABV (108 proof), not a separate entry field.
- Migration marks existing gin labels Aged when they already have age, NAS, an age statement, or a finish. It adds Juniper to existing gin labels. Existing numeric age, dates, and statements remain stored even where the new forms hide them.

## Next category pass

Whiskey, vodka, and remaining categories need their own decision rounds with the owner. Do not infer their spirit-specific fields from this brief.
