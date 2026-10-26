# Liqueur label and bottle facts

Confirmed by the collection owner on 2026-10-26. These decisions apply to adding, editing, and reading Liqueur labels and bottles on web and iOS. Liqueur is a collection category separate from the agreed Amaro and Flavored Vodka categories.

## Categories and compact display

- Add **Liqueur** as a selectable parent category. Add seven selectable children: **Herbal Liqueur**, **Nut Liqueur**, **Chocolate Liqueur**, **Coffee Liqueur**, **Cream Liqueur**, **Anise Liqueur**, and **Fruit Liqueur**.
- A label selects one child or the parent, not multiple children. A product that fits several children uses the best primary category; its flavor choices can express the overlap.
- Orange liqueurs, including curaçao and triple sec, belong under Fruit Liqueur rather than a separate Orange child. Other citrus or fruit liqueurs, such as yuzu, also fit Fruit Liqueur.
- **Flavors** is the main liqueur-specific fact in compact collection grids and tournament views. Show multiple known flavors compactly. If an older incomplete label has no flavors, leave the fact blank rather than inventing one.

## Flavors, bases, and maker

- Offer reusable, multiple-choice **Flavors** on the label, including custom choices. Require at least one flavor to save a new or edited Liqueur label. Multiple flavors may describe one product.
- Offer a separate, optional, reusable, multiple-choice **Base Ingredients** label field with custom choices and no percentages. It records known defining components, not an exhaustive ingredient list. Choices may name fruit, another ingredient, or a spirit: for example Cognac and Orange, or Pear. Unknown bases stay blank.
- Do not infer Flavors from Base Ingredients or vice versa. The same item may appear in both when it is both a defining ingredient and a flavor. Do not derive a full recipe from either field or from the product name.
- Hide the generic **Mashbills** picker for Liqueur without deleting existing linked data.
- The existing **Brand** serves as the producer or maker. Keep a separate, optional distillery link when known; do not require or invent a distillery to stand in for the brand.

## Origin and dairy

- Offer optional product **Country** and **Region** on the label and detail page. Populate them from a linked distillery when the values are unambiguous, but allow a manual change that persists rather than being overwritten by later suggestions. Leave unknown origin blank.
- Offer a three-state **Dairy / Non-dairy / Unknown** label fact only for the Liqueur parent, Chocolate Liqueur, and Cream Liqueur. Default to Unknown; do not infer dairy content from the category name. Do not show this field on Herbal, Nut, Coffee, Anise, or Fruit Liqueur forms.

## Age, casks, and other process facts

- Offer an **Aged** label switch. Ordinary liqueur hides age, age statement, NAS, and cask fields; preserve previously stored hidden values.
- When Aged is on, expose numeric age in **years and months**, an optional age statement, an explicit NAS switch, and a reusable, multiple-choice **Cask Types** picker. Follow the aged-gin NAS interaction for numeric age. Do not infer a category minimum age.
- A cask type does not imply a finishing stage, order, or duration. Do not offer a Cask Strength switch for Liqueur.
- Do not add structured sugar amount, sweetness scale, or storage-instruction fields. Disclosed sugar and storage guidance can be recorded in notes; subjective sweetness belongs in tasting notes.

## Labels and bottles

- Do not show a release selector for Liqueur. A product with a different flavor, base ingredient, age, proof, or other label product fact gets a new label.
- Bottles inherit all label product facts, including category, flavors, base ingredients, origin, dairy status when applicable, Aged status, age, Cask Types, and proof. Do not offer Liqueur bottle-level age or proof overrides.
- Hide Batch / Lot, Release Year, Single Barrel, Private Selection, Barrel Number, Bottle Count, Warehouse, and Rick / Floor on Liqueur bottle forms and read views. Preserve any previously stored values when these fields are hidden.
- Keep physical-bottle facts such as purchase date, price, location, opened state, and fill level on each bottle. The shared duplicate-bottle flow opens an unsaved form with manually entered bottle facts copied. Tasting notes remain with the original bottle; a new bottle is created only when saved.

## Acceptance examples

| Entry | Expected behavior |
| --- | --- |
| Coffee-and-cream product | One primary child category; Coffee and Cream can both appear as flavors |
| Fruit Liqueur with Orange and Cognac as base ingredients | Both bases are recorded; Orange flavor is entered separately rather than inferred |
| Liqueur with no flavor | Form requires at least one flavor before saving |
| Cream Liqueur with no dairy disclosure | Dairy fact remains Unknown |
| Fruit Liqueur | Dairy fact is not presented |
| Aged Liqueur, 8 months | Age accepts months, with no inferred minimum |
| Same recipe sold at two different proofs | Two labels; bottles inherit the proof on their selected label |

## Implementation boundary

- Add the Liqueur category tree and spirit-specific field rules so the same flavor validation, Base Ingredients, dairy eligibility, age behavior, and compact fact display apply across web, iOS, collection views, and tournaments.
- Preserve existing linked Mashbills, releases, and bottle-specific fields while hiding them from new Liqueur entry. Audit existing Liqueur-like records before migrating them; do not silently reinterpret Mashbills as Base Ingredients or generate Flavors from category names.
