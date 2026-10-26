# American whiskey label and bottle facts

Confirmed by the collection owner on 2026-10-20. This is the American whiskey decision round for add, edit, and read flows on web and iOS. [Irish Whiskey](2026-10-23-irish-whiskey-label-bottle-fields.md) and [Scotch Whisky](2026-10-25-scotch-whisky-label-bottle-fields.md) have their own rounds. This brief extends the [spirit-specific facts](2026-10-19-spirit-specific-label-bottle-fields.md).

## Categories and identity

- Offer Bourbon, Rye, Wheat Whiskey, Corn Whiskey, Light Whiskey, American Single Malt, and American Whiskey. American Whiskey is a selectable catch-all, not only a parent heading.
- Keep multiple reusable mashbills linked to a label, including their distillery attribution. Do not replace them with a flat grain list.
- Each Pursuit Series Episode is its own label, with its own mashbills, distilleries, and finishes. There is no parent series record. Its name can include the series and Episode number so the labels are searchable together.
- A known recurring batch or yearly edition, such as a Booker’s or Stagg release, belongs under its label as a release. A release can set its own proof and age, including an age statement. Do not turn every single barrel into a release. A bottle inherits release facts when one is selected; its own values take precedence.

## Age and display

- The entry form asks for either a known numeric age (the youngest component's age or documented minimum) or a free-text age statement such as “blend of 8 to 16 year old.” A number derived from the statement is supporting grouping data, not a second user-entered age. Show the statement instead of that derived number.
- Read an unambiguous youngest age from an age statement automatically. For “blend of 8 to 16 year old,” show compact “8–16 yrs” in tables and tournaments and use 8 years for age sorting and tournament grouping. The derived number fills a greyed age box. Triple-clicking unlocks it for manual correction; a manually changed value persists when the statement changes. Until manually changed, edits to the statement recalculate it. If no age can be read confidently, leave the grouping age unknown and still show the statement.
- With no entered age or age statement, Straight displays italic “2 yrs”; Straight with explicit NAS or Bottled in Bond displays italic “4 yrs.” These are inferred minima, not measured ages. Use the inferred number for sorting and tournament grouping as the owner requested. Keep its inferred origin distinguishable from a manually entered age even when both have the same numeric value.
- Label and bottle detail pages explain the source of an inferred minimum on hover and through an accessible tap or focus control. An entered age or statement takes precedence over a designation minimum.
- Resolve age and proof from the bottle first, then its selected release, then the label, then any applicable designation minimum. A bottle's own age statement or numeric age replaces the inherited age display. The statement-derived grouping value is supporting data, not a competing display statement.
- Do not present an inferred minimum as an entered or measured age. The current implementation writes designation minima into numeric age fields; implementation of this brief must preserve the distinction, including for existing records where possible.
- Reference for the four-year inference: [TTB distilled spirits age-statement guidance](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/distilled-spirits-faqs). This is display guidance for the collection, not a claim that the exact age is known.

## Proof, process, and releases

- Cask Strength remains a label checkbox. When selected, label proof and ABV are greyed out; triple-clicking permits a value that applies to the whole label. A known release may set its own proof, which bottles inherit unless overridden. This handles batch-to-batch proof changes without inventing one proof for the parent label.
- Offer a single “Non-chill filtered” switch on the label. Off means no claim was recorded, not an assertion that the whiskey was chill filtered.
- Keep Entry Proof and Cooperage as optional label facts. Remove Char Level and Color Added from American whiskey entry. Preserve existing stored values when hiding those fields.
- A bottle inherits its label's mashbills, distilleries, finishes, and process facts. Release and bottle overrides remain for the facts already designated as variable, especially proof and age. A product with a different mashbill or source, such as a Pursuit Series Episode, gets its own label.

## Duplicate bottle

- Offer “Duplicate bottle” from an existing bottle. Open a new bottle entry with all manually entered bottle facts copied, including label and release selection, batch and barrel details, proof and age overrides, photo, notes, tags, purchase date and price, location, opened state, and fill level.
- The copy is not created until the user presses Save or Add Bottle on that entry page. The user can adjust any copied value first or leave without creating a bottle.
- Tasting notes stay attached only to the original physical bottle.

## Acceptance examples

| Entry | Compact age | Sorting and tournament age | Detail explanation |
| --- | --- | --- | --- |
| Straight, no entered age or statement | *2 yrs* | 2 years | Inferred from Straight |
| Straight and explicitly NAS, no entered age | *4 yrs* | 4 years | Inferred from Straight + NAS |
| Bottled in Bond, no entered age | *4 yrs* | 4 years | Inferred from Bottled in Bond |
| Statement “blend of 8 to 16 year old” | 8–16 yrs | 8 years, unless manually corrected | Statement is displayed; youngest age is derived for grouping |
| Statement with no clear age | Compact statement | Unknown | No numeric age was inferred |
| Cask Strength label with no proof; known batch release at 126 proof | Release proof on its bottles | N/A | Release overrides the label's blank proof |

## Implementation boundaries

- Web and iOS should read the same age source and derived grouping value so collection tables, label and bottle pages, and tournaments agree.
- The release form needs an editable age statement; releases already store one but do not expose it in the form.
- Existing records may contain ages automatically filled by the old Straight, NAS, or Bottled in Bond rules. Audit them before changing age provenance so manually entered ages are not silently reclassified.
