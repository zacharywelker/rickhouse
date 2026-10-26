# Vodka label and bottle facts

Confirmed by the collection owner on 2026-10-25. These decisions apply to adding, editing, and reading Vodka and Flavored Vodka labels and bottles on web and iOS. The shared bottle inheritance and duplication rules are described in [American whiskey label and bottle facts](2026-10-20-american-whiskey-label-bottle-fields.md); the vodka choices are specified here.

## Categories and label facts

- Offer two selectable categories: **Vodka** and **Flavored Vodka**. Flavored Vodka is a child of Vodka.
- Replace the generic Mashbills picker for these categories with **Base Ingredients**. It is a reusable, multiple-choice label field with custom entries. Common choices can include wheat, rye, potato, corn, and grape. Do not ask for percentages or infer a recipe from the product name.
- Base Ingredients are optional for both categories. An undisclosed base stays unknown rather than blocking save.
- Flavored Vodka has a reusable, multiple-choice **Flavors** label field with custom entries. Require at least one flavor to save a Flavored Vodka label. Multiple flavors can describe one product, such as lemon and lime.
- Flavors belong to the label and are inherited by its bottles. Different flavored products have their own labels; vodka has no release selector for variants.
- Use Base Ingredients as the main vodka-specific fact in compact collection grids and tournament views for Vodka; use Flavors for Flavored Vodka. Display multiple known choices compactly without inventing an unknown choice.

## Process and age

- Do not add structured filtration methods, filtered-pass counts, Additive Free, Natural Flavors, Unsweetened, or No Sugar Added fields for vodka. If relevant, these claims can be recorded in notes.
- Do not offer an Aged switch or age, age statement, NAS, Finishes, or Cask Types entry for Vodka or Flavored Vodka. Do not infer an age for either category.
- Keep the shared label proof and ABV fields. A bottle inherits its label's proof unless the owner enters a bottle override. Do not add a vodka-specific cask-strength control.
- Hide fields excluded from vodka onboarding without erasing previously stored data. Existing hidden facts need a nondestructive migration or read path when implementing this brief.

## Bottles and release boundary

- Do not show a release selector for either vodka category. Hide vodka bottle Batch, Release Year, Single Barrel, Private Selection, Barrel Number, Bottle Count, Warehouse, and Rick / Floor fields. Do not create release records as part of the vodka add flow.
- Bottles inherit their label's base ingredients, flavors, and proof. They retain the usual bottle proof override and purchase and collection details.
- Use the shared duplicate-bottle flow: open an unsaved new-bottle form with manually entered bottle facts copied, and keep tasting notes with the original bottle. The copy is created only when the owner saves it.

## Acceptance examples

| Entry | Expected behavior |
| --- | --- |
| Vodka with no disclosed base | Label saves; Base Ingredients remain unknown |
| Vodka with wheat and rye recorded | Both reusable ingredients appear on the label and compact collection or tournament facts |
| Flavored Vodka with no flavor | Form asks for at least one flavor before saving |
| Flavored Vodka with lemon and lime | Both flavors appear as inherited label facts and as the compact vodka-specific fact |
| Vodka bottle with a different measured proof | Bottle displays its entered proof; label proof remains unchanged |
| Vodka bottle entry | No release selector, batch, private selection, or barrel-related fields appear |

## Implementation boundary

- Vodka and Flavored Vodka need distinct category identities within the vodka field group so flavor validation and compact fact selection work consistently on web, iOS, collection views, and tournaments.
- Replace the generic vodka Mashbills presentation with Base Ingredients without deleting existing linked mashbill data. Audit any existing vodka labels before mapping or hiding old links; do not silently reinterpret a multi-grain mashbill as a complete ingredient list.
- Existing release or bottle details, if any, must remain stored when new vodka entry and read views hide them.
