# Canadian Whisky label and bottle facts

Confirmed by the collection owner on 2026-10-20. These decisions apply to adding, editing, and reading Canadian Whisky labels, releases, and bottles on web and iOS. The shared whiskey age, inheritance, release, and duplicate-bottle behavior is in [American whiskey label and bottle facts](2026-10-20-american-whiskey-label-bottle-fields.md); the Canadian differences are specified here. [Irish Whiskey](2026-10-23-irish-whiskey-label-bottle-fields.md) and [Scotch Whisky](2026-10-25-scotch-whisky-label-bottle-fields.md) have their own rounds.

## Category, makers, and mashbills

- Add one selectable category named **Canadian Whisky** under Whiskey. Do not create a Canadian Rye subcategory; “Rye” can remain part of a label's name. Use the Canadian spelling “whisky” for this category.
- Keep the existing reusable, multiple-mashbill model, including attribution to a distillery when known. An undisclosed blend can leave some or all mashbills unknown. Do not derive a grain percentage or mashbill from “Rye” in a product name.
- Show Canadian distilleries by default in the distillery picker. The producer or bottler can be recorded separately when its role differs or the distillery is not known; do not turn a producer into a distillery solely to fill the link.

## Age, proof, and inheritance

- When no age or age statement is entered, show italic **3 yrs** in compact collection and tournament views. This is an inferred minimum, not a measured age. Use 3 years for sorting and tournament grouping, and explain the inference on the label and bottle detail pages through hover and accessible tap or focus. [Canadian Food Compositional Standards, section 2.1.3](https://inspection.canada.ca/en/about-cfia/acts-and-regulations/list-acts-and-regulations/documents-incorporated-reference/canadian-food-compositional-standards-0), sets a three-year minimum for Canadian Whisky.
- Keep an explicit NAS switch so “no age printed” can be recorded even when an age is known from another source. An unchecked NAS switch does not change the three-year fallback when age and statement are blank.
- Use the same numeric-age-or-statement entry, automatic youngest-age suggestion from clear statement text, greyed age box, triple-click correction, compact statement display, and sorting and tournament grouping behavior as the American whiskey brief. An unclear statement remains visible but supplies no numeric grouping age.
- Resolve proof and age from the bottle first, then its selected release, then the label, then the three-year category minimum. A known release can override proof or age, including an age statement. Bottles retain their own overrides.
- Cask Strength is a label checkbox. It greys label proof and ABV unless deliberately unlocked by triple-click; a release or bottle can supply its own proof. Keep Entry Proof and Cooperage as optional label facts.

## Process and casks

- Offer **Non-chill filtered** and **Additive Free** as separate label checkboxes. Checked records a positive claim. Unchecked means unknown, not that the opposite is true. Do not add a general “contains additives” yes/no control.
- Hide the American Straight and Bottled in Bond controls. Hide the separate Colour Added and Char Level entry fields. Preserve any previously stored values rather than clearing them when the form hides them.
- For Canadian Whisky, relabel the existing reusable, multiple-choice **Finishes** picker as **Cask Types**. Its choices remain reusable and custom choices can be created as today. A cask type is not automatically a secondary finishing cask: the form does not require a first cask, finishing role, order, or duration.
- Say **Cask Types** wherever Canadian Whisky facts are entered or read, including label and bottle pages, collection filters, and tournament facts. Other spirits retain their existing **Finishes** wording. The same underlying choices may be reused without presenting them as finishes for Canadian Whisky.

## Labels, releases, and bottles

- Use a release for known recurring or yearly editions that vary in proof or age while retaining the same product facts. If mashbills, distilleries, or cask types differ, make separate labels. A bottle inherits label and selected-release facts unless it has its own override.
- Keep single-barrel and private-selection bottle details, including barrel number. Hide **Warehouse** and **Rick / Floor** on Canadian Whisky bottle forms and read views; preserve any existing stored values.
- The shared duplicate-bottle flow copies manually entered bottle facts into an unsaved new-bottle form and excludes tasting notes, as decided in the American whiskey round.

## Acceptance examples

| Entry | Display | Sorting and tournament value |
| --- | --- | --- |
| Canadian Whisky, age and statement blank | Italic *3 yrs*, with a minimum-age explanation on its detail page | 3 years |
| Canadian Whisky, NAS checked, age and statement blank | Italic *3 yrs*; NAS remains recorded separately | 3 years |
| Clear statement such as “8 to 16 year old” | Compact statement; greyed youngest age suggested as 8 | 8 years until manually corrected |
| Additive Free unchecked | No additive claim shown | N/A |
| Two recorded cask types | Both under **Cask Types**, without assuming either is a finish | N/A |

## Implementation boundary

- Canadian Whisky needs its own category identity within the whiskey field group so American-only controls stay hidden and Canadian cask and age language applies consistently across web, iOS, filters, and tournaments.
- Keep inferred age provenance separate from entered age, as required by the American whiskey brief. The category minimum must never be stored or described as a measured age.
