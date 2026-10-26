# Scotch Whisky label and bottle facts

Confirmed by the collection owner on 2026-10-25. These decisions apply to adding, editing, and reading Scotch Whisky labels, releases, and bottles on web and iOS. Shared whiskey age, inheritance, release, and duplicate-bottle behavior is described in [American whiskey label and bottle facts](2026-10-20-american-whiskey-label-bottle-fields.md); the Scotch choices are specified here.

## Categories and origin

- Offer five Scotch categories: **Single Malt Scotch Whisky**, **Single Grain Scotch Whisky**, **Blended Scotch Whisky**, **Blended Grain Scotch Whisky**, and **Blended Malt Scotch Whisky**. The [Scotch Whisky Association](https://www.scotch-whisky.org.uk/discover-scotch/enjoying-scotch/scotch-whisky-categories/) identifies these five categories.
- Keep **Scotch Whisky** selectable when the owner does not know the category. Treat it as an unknown category in the collection, not as a sixth formal Scotch category. Do not guess a subtype from an undisclosed recipe or product name.
- Offer Campbeltown, Highland, Islay, Lowland, and Speyside as recognized regions, plus **Islands** explicitly identified as an informal grouping. Allow multiple regions when known, including for a blend. Leave the field blank when provenance is unknown. The [Scotch Whisky Association](https://www.scotch-whisky.org.uk/discover-scotch/enjoying-scotch/) lists five recognized regions.
- A producer or bottler is not automatically the distillery when the source is unknown. A label may link multiple known source distilleries through the existing model.

## Mashbills and peat

- **Single Malt Scotch Whisky** shows **100% malted barley** automatically as a category fact. A reusable linked mashbill remains available for a disclosed recipe or source attribution; the owner does not need to create a redundant mashbill for every Single Malt label.
- The other Scotch categories retain reusable, multiple linked mashbills, including distillery attribution when known. Their undisclosed grains and percentages stay unknown. Do not infer exact grain percentages from the word “Grain” or “Blended.”
- Use a three-option segmented selector on the label: **Unknown**, **Unpeated**, **Peated**. Unknown is the default and does not claim either outcome. Do not add a PPM field.
- A linked mashbill that explicitly identifies peated malted barley sets the label to **Peated**. Selecting Peated alone does not invent a grain ingredient or mashbill. A bottle inherits the label's peat fact unless an existing override model explicitly supports a different fact.

## Age, strength, and process

- With no entered age or age statement, display italic **3 yrs** in compact collection and tournament views. This is an inferred Scotch minimum, not a measured age. Use 3 years for sorting and tournament grouping and explain the inference on label and bottle detail pages through hover and accessible tap or focus. The [Scotch Whisky Association](https://www.scotch-whisky.org.uk/discover-scotch/enjoying-scotch/scotch-whisky-categories/) describes the three-year minimum.
- Keep explicit NAS. Use the shared numeric-age-or-statement entry, youngest-age suggestion from clear statement text, greyed derived age box with triple-click correction, compact statement display, and sorting and tournament grouping behavior. An unclear statement remains visible but supplies no numeric age. A stated age or age statement takes precedence over the inferred minimum.
- Resolve age and proof from the bottle first, then its selected release, then the label, then the three-year category minimum for age. A known release can override proof or age, including an age statement; bottles retain their own overrides.
- Keep **Non-chill filtered** as a positive label checkbox. Unchecked means no claim was recorded. Keep **Cask Strength** as a label checkbox: it greys the label's proof and ABV unless deliberately unlocked by triple-click, while a release or bottle may supply its own proof.
- Omit Colour, Entry Proof, and Cooperage fields from Scotch onboarding. Preserve any previously stored values when hiding fields rather than clearing them.

## Cask types

- Relabel the existing reusable, multiple-choice Finishes picker as **Cask Types** for Scotch. Use the same picker presentation as Bourbon's Finishes, including reusable and custom choices.
- A selected cask type is not automatically a secondary finishing cask. Do not require a first cask, finishing role, order, or duration.
- Say **Cask Types** wherever Scotch facts are entered or read, including label and bottle pages, collection filters, and tournament facts.

## Labels, releases, and bottles

- A known edition that varies in age or strength while retaining product facts belongs under its label as a release. Different source distilleries, mashbills, or cask types require separate labels. Do not create a release merely because an individual bottle has a barrel number or private selection.
- Keep barrel number and private selection for individual Scotch bottles. Hide **Warehouse** and **Rick / Floor** on Scotch bottle forms and read views, preserving previously stored values.
- A bottle inherits label and selected-release facts unless it has its own supported override. The shared duplicate-bottle flow copies manually entered bottle facts into an unsaved new-bottle form and leaves tasting notes with the original bottle.

## Acceptance examples

| Entry | Display or form behavior | Sorting and tournament age |
| --- | --- | --- |
| Scotch Whisky with unknown category | Parent category remains selectable; formal subtype is unknown | Depends on age facts |
| Single Malt Scotch Whisky without a linked mashbill | Shows 100% malted barley as a category fact | Depends on age facts |
| Blended Scotch Whisky with undisclosed components | Mashbills and percentages remain unknown | Depends on age facts |
| Linked mashbill explicitly includes peated malted barley | Peat selector moves to Peated | Depends on age facts |
| Scotch with no entered age or statement | Italic *3 yrs* with a minimum-age explanation on detail pages | 3 years |
| Two known cask types | Both appear under Cask Types without assuming either is a finish | Depends on age facts |

## Implementation boundary

- Scotch Whisky and its five categories need a category identity within the whiskey field group so the grain defaults, peat selector, three-year minimum, region language, and Cask Types wording apply consistently across web, iOS, filters, and tournaments.
- Preserve inferred age provenance separately from entered age. The category minimum must never be stored or described as an exact measured age.
