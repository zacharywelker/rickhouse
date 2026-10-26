# Amaro label and bottle facts

Confirmed by the collection owner on 2026-10-25. These decisions apply to adding, editing, and reading Amaro labels and bottles on web and iOS. Amaro is a broad collection category covering fernets, bitter aperitifs, and related amari. The category is a collection choice; it does not assert a particular legal product classification.

## Category, style, and compact display

- Add **Amaro** as its own selectable top-level category and field group.
- Offer one optional label **Style** from: Fernet, Alpine, Citrus, New-World, Old-World, Medium-Bodied, Aperitivo, Carciofo, Genepy, and Rabarbaro. Do not offer Chinato. One label may have at most one style; no style is required.
- Use Style as Amaro's main spirit-specific fact in compact collection grids and tournament views. If Style is unset, leave that fact blank rather than showing a placeholder or falling back to Region.
- A product with a different style is a different label. Amaro has no release selector.

## Botanicals and maker

- Offer reusable, multiple-choice **Botanicals** on the label. Known botanicals can be selected or added; a secret or undisclosed recipe can leave the field blank. Do not infer a complete botanical recipe.
- Selecting **Carciofo** automatically adds **Artichoke**; **Rabarbaro** adds **Rhubarb**; **Genepy** adds **Wormwood**. Wormwood is the owner's broad botanical grouping for the Génépi plant, not an assertion of an exact *Artemisia* species.
- Track whether a botanical was added by a style or manually. Removing or changing a style removes only its automatic additions. If the same botanical was manually entered, preserve the manual entry.
- The existing **Brand** is the producer or maker identity for Amaro. Keep a separate, optional distillery link when the distillery is known. Do not require or invent a distillery to represent the brand.
- Do not show the generic **Mashbills** picker or a separate **Base Alcohol** field for Amaro. A disclosed base may be recorded in notes.

## Origin

- Offer optional product **Country** and **Region** on the label and detail page. Style, not Region, is the default compact fact.
- Populate origin automatically from a linked distillery when the value is unambiguous. Let the owner edit or replace the suggested value; a manual value persists and is not overwritten by later automatic suggestions. When no reliable distillery origin is available, leave the field blank until entered manually.

## Age and casks

- Offer an **Aged** switch on the label. Ordinary Amaro hides age, age statement, NAS, and cask fields. Preserve previously stored hidden values rather than deleting them.
- When Aged is on, expose numeric age in **years and months only**, an optional age statement, an explicit NAS switch, and the reusable multiple-choice **Cask Types** picker. Follow aged gin's NAS interaction for numeric age. Do not provide a days field or infer a minimum age.
- Cask Types are label facts. A cask type does not imply a finishing stage, order, or duration. A product with different age, proof, botanicals, or cask types requires a new label.
- Do not add structured bitterness or sweetness scales. Those impressions belong in tasting notes.

## Bottles and releases

- Amaro has no release selector. A named edition or otherwise different product is a separate label.
- Bottles inherit all label product facts, including Style, Botanicals, Origin, Aged status, age, Cask Types, and proof. Do not offer bottle-level overrides of those facts for Amaro; a different age or proof requires a new label.
- Hide Batch / Lot, Release Year, Single Barrel, Private Selection, Barrel Number, Bottle Count, Warehouse, and Rick / Floor on Amaro bottle forms and read views. Do not erase previously stored values when hiding these fields.
- Keep physical-bottle facts such as purchase date, price, location, opened state, and fill level on each bottle. The shared duplicate-bottle flow opens an unsaved copy with manually entered bottle facts copied. Tasting notes stay with the original bottle; the new bottle is created only when saved.

## Acceptance examples

| Entry | Expected behavior |
| --- | --- |
| Amaro label with no style | Style fact is blank in compact views |
| Carciofo style selected | Artichoke appears among Botanicals as an automatic addition |
| Carciofo removed after Artichoke was also entered manually | Manual Artichoke remains |
| Genepy style selected | Wormwood appears as the owner's broad botanical grouping |
| Linked distillery supplies a known region; owner edits the region | Manual region is displayed and remains after subsequent suggestions |
| Aged Amaro, 1 year and 6 months | Numeric age uses years and months; no days or inferred age |
| Same Amaro recipe bottled at two different proofs | Two labels, each with its own proof; bottles inherit their selected label |

## Implementation boundary

- Amaro needs its own category identity and field group so Style, Botanicals, Origin, and Aged behavior can be applied consistently across web, iOS, collection views, and tournaments.
- Preserve the source of style-added botanicals separately from manual selections so changing a style cannot erase facts the owner entered.
- Existing Amaro-like records, if any, must not lose stored values when moving to Amaro or when excluded fields are hidden.
