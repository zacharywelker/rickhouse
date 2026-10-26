# Irish Whiskey label and bottle facts

Confirmed by the collection owner on 2026-10-23. These decisions apply to adding, editing, and reading Irish Whiskey labels, releases, and bottles on web and iOS. Shared age, inheritance, release, and duplicate-bottle behavior is described in [American whiskey label and bottle facts](2026-10-20-american-whiskey-label-bottle-fields.md); the Irish choices are specified here.

## Categories and distilleries

- Keep **Irish Whiskey** as a selectable catch-all. Add four children: **Pot Still Irish Whiskey**, **Malt Irish Whiskey**, **Grain Irish Whiskey**, and **Blended Irish Whiskey**. Do not require a child when the style is not known.
- The Irish Whiskey distillery picker includes distilleries on the island of Ireland, including Northern Ireland. A producer or bottler is not automatically the distillery when the actual source is unknown. The [Irish Whiskey technical file](https://www.marketaccess.agriculture.gov.ie/media/marketaccess/content/Irish%20Whiskey%20Technical%20File.pdf) covers whiskey distilled on the island, including Northern Ireland.

## Grains, mashbills, and peat

- **Malt Irish Whiskey** shows the known category composition, **100% malted barley**, automatically. Do not make the owner create the same mashbill for every malt label. A linked reusable mashbill remains optional for a specific producer's recipe or attribution.
- **Pot Still Irish Whiskey** starts with malted barley and unmalted barley as known ingredients. Show category guidance of at least 30% each, but leave actual percentages blank until known. Other disclosed grains may be added. Entered percentages can be partial: unknown shares remain unknown, and the form must not invent values to make the total 100%.
- **Grain Irish Whiskey** and **Blended Irish Whiskey** use the reusable, multiple linked-mashbill picker, with distillery attribution when known. An undisclosed recipe can stay blank. Do not infer exact grain percentages from the style name.
- Offer a **Peated** label checkbox. Unchecked means no peated claim was recorded. A linked mashbill that explicitly contains peated malted barley turns the checkbox on. Ticking Peated on its own does not create an ingredient or a full mashbill.
- Do not add a distillation-count field. The grain guidance follows the [Irish Revenue whiskey verification checks](https://www.revenue.ie/en/companies-and-charities/documents/excise/whiskey-verification-checks.pdf), not a claim that a particular undisclosed recipe has those exact percentages.

## Age, proof, and inheritance

- With no entered age or age statement, display italic **3 yrs** in compact collection and tournament views. This is an inferred category minimum, not a measured age. Use 3 years for sorting and tournament grouping and explain its source on label and bottle detail pages through hover and accessible tap or focus. The [Irish Whiskey technical file](https://www.marketaccess.agriculture.gov.ie/media/marketaccess/content/Irish%20Whiskey%20Technical%20File.pdf) requires at least three years' maturation in wooden casks.
- Keep explicit NAS. Use the same numeric-age-or-statement entry, automatic youngest-age suggestion from clear statement text, greyed age box, triple-click correction, compact statement display, and sorting and tournament grouping behavior as the American and Canadian whiskey briefs.
- Resolve age and proof from the bottle first, then a selected release, then the label, then the three-year category minimum. A release may set its own proof, numeric age, or age statement; a bottle may override its inherited values.
- Cask Strength remains a label checkbox. It greys the label's proof and ABV until deliberately unlocked by triple-click. A release or bottle may have its own proof. Keep Entry Proof and Cooperage as optional label facts.

## Casks and other process facts

- Follow Canadian Whisky's **Cask Types** model: reuse the multiple-choice Finishes references but call them Cask Types in Irish Whiskey entry and read views, collection filters, and tournament facts. The list does not require a first-cask or finishing role, order, or duration.
- Offer **Non-chill filtered** and **Additive Free** as separate label checkboxes. Checked records a positive claim; unchecked means unknown. Hide the separate Colour Added and Char Level entry fields, preserving stored values. Hide American Straight and Bottled in Bond controls.

## Labels, releases, and bottles

- Use a release for known editions that vary in proof or age while retaining the label's production facts. If mashbills, distilleries, or cask types differ, use separate labels. A bottle inherits the chosen release and label unless it has its own override.
- Keep barrel number and private selection for Irish Whiskey bottles. Hide **Warehouse** and **Rick / Floor** on bottle forms and read views, preserving stored values.
- The shared duplicate-bottle flow copies manually entered bottle facts into an unsaved new-bottle form. Tasting notes remain with the original bottle.

## Acceptance examples

| Entry | Display or form behavior | Sorting and tournament age |
| --- | --- | --- |
| Malt Irish Whiskey with no mashbill link | Shows 100% malted barley as a category fact | Depends on age facts |
| Pot Still Irish Whiskey with no disclosed ratio | Shows malted and unmalted barley; actual percentages stay blank | Depends on age facts |
| Pot Still Irish Whiskey with one disclosed grain percentage | Retains that percentage and leaves the others blank | Depends on age facts |
| Linked mashbill contains peated malted barley | Peated checkbox turns on | Depends on age facts |
| Irish Whiskey with no entered age or statement | Italic *3 yrs* with a source explanation on detail pages | 3 years |
| Two known casks | Both appear under **Cask Types**, without assuming either is a finish | Depends on age facts |

## Implementation boundary

- Irish Whiskey and its four children need a category identity within the whiskey field group so the Irish grain defaults, three-year minimum, distillery filter, and Cask Types wording apply consistently across web, iOS, filters, and tournaments.
- Preserve inferred-age provenance separately from entered ages. A category minimum is never stored or described as an exact measured age.
