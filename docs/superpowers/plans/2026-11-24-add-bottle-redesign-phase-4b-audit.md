# Add-bottle redesign, phase 4B: audit of section 9 against the code

Spec: `docs/superpowers/specs/2026-11-23-add-bottle-redesign-design.md` section 9. Code audited: worktree `p4b-retire` at `b9db98e` (phase 4A, "the gap list is empty"). Paths below are relative to `src/lib/expressions/` unless they start with `src/` or `drizzle/`. Sizes: S under a day, M a few days, L about a week or more. "Flag" marks a rule the spec itself says is unverified.

## Summary

102 rules checked: **51 BUILT, 9 PARTLY BUILT, 42 NOT BUILT**. BUILT is almost entirely show/hide rules, fixed Blue Weber and Juniper, Bottled in Bond, Peat, regions, Barrel type and the rum Aged toggle (phase 4A and October). The derived values, the shares tables, and every rule keyed on the new kinds (agricole, cachaca, spiced-rum, apple, pisco, genever, absinthe, akvavit, shochu) are not built. 12 tasks proposed at the end; 6 need migrations (4, 8, 9, 10, 11, 12), task 6 maybe.

Main findings. (1) 4A only built show/hide rules, so almost every **derived value** in section 9 is missing: tequila class, brandy designation and pisco class are plain manual selects (`fields.ts:102-110`); class-to-statement exists on save (`save.ts:383-386`) but age-to-class does not. (2) The overview's claim that the Calvados fruit table and Pisco grapes were built in October is wrong: what exists is a **tag list** with a grape/apple/pear family check (`ingredient-picker.tsx`, `spirit-details.ts:53-59`); `expression_ingredients` has no share or role column (`src/db/schema.ts:432-438`), so no grapes or fruit **table** exists for Cognac, Armagnac, Calvados or Pisco. (3) None of the kinds `agricole`, `cachaca`, `spiced-rum`, `apple`, `genever` class, `mezcal` production, `pisco`, `absinthe`, `akvavit`, `shochu` carries a rule beyond show/hide (grep of `src/` for these slugs finds only `rules.ts`, `tree.ts` and tests). (4) Ingredient kinds have a DB CHECK (`drizzle/0048_spirit_label_facts.sql:3`), so a new ingredient kind needs a migration; the latest migration is `0056_rum_aged_backfill.sql`, so new ones start at 0057.

## Tequila

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| T1 | Class list Blanco, Joven, Reposado, Añejo, Extra Añejo, Cristalino, in readable words | BUILT | `spirit-details.ts:15-24`, select in `fields.ts:101-107` (labels like "Añejo · 1-3 years") | none |
| T2 | Blanco and Reposado take only months and days; the others take years too | PARTLY BUILT | `rules.ts:112-114` hides **all** age fields for Blanco (spec says months and days stay); Reposado unrestricted; no years-hidden rule | hide `ageYears` for Blanco and Reposado, stop hiding months/days for Blanco; update `bottle-applicability.ts:28` (S, no migration) |
| T3 | Typing an age sets the class: under 2 months Blanco, 2 months to under a year Reposado, 1 year+ Añejo, 3 years+ Extra Añejo | NOT BUILT | searched `classFor`, `fromAge`, `classFrom`, "2 months": none. Only class-to-statement exists (`save.ts:383`, `spirit-details.ts:71-75`) | pure `tequilaClassFromAge()` and an `onChange` hook beside `withAgeDefaults` (`src/lib/bottles/age.ts:126`) in `expression-form.tsx`, plus the bottle form and server patch path (S-M, no migration) |
| T4 | Joven and Cristalino stay manual | BUILT | no automation touches them; select offers both (`spirit-details.ts:15`). Holds trivially until T3 is built; T3 must leave them alone | keep in T3 |
| T5 | Maguey row shows Blue Weber | BUILT | `ingredient-picker.tsx:34,67-68`, `save.ts:274`, `spirit-details.ts:54` | none |
| T6 | Barrel type replaces Finish | BUILT | `rules.ts:278-279` (`group === "agave"`) | none |
| T7 | Optional Cooking method, Extraction, Additive free | BUILT | agave section `fields.ts:178-210`; columns `src/db/schema.ts:394-396` | none |

## Mezcal

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| M1 | Age-to-class rule, without Extra Añejo | NOT BUILT | class is tequila-only: `rules.ts:98`, `save.ts:346`, `writable-facts.ts:14`, `bottle-applicability.ts:25` | extend class to mezcal (reuse `tequila_class` text column or add `mezcal_class`), with T3's function (S-M; migration only if a new column) |
| M2 | Class Blanco / Joven, Reposado, Añejo, Madurado en Vidrio (no barrel, no age typed) | NOT BUILT | no mezcal class options; `rules.ts:274-275` comment: "Not yet: Madurado en Vidrio, which the app cannot say" | mezcal class option list; Madurado hides age and barrel type (`barrelTypeKind`) (M) |
| M3 | Maguey is a free list | BUILT | `ingredient-picker.tsx:34-38` fixes only tequila; mezcal falls through to free entry | none |
| M4 | **Production** (Mezcal, Artesanal, Ancestral) after Maguey. Flag: designer's reading, verify | NOT BUILT | searched `ancestral`, `artesanal`, `production` (only env/auth hits) | new text column `mezcal_production` on `expressions` (migration 0057), selector in agave section (M) |
| M5 | Production restricts cooking, extraction and still (Ancestral: pit oven, clay pot still, hand extraction; Artesanal: no column still, no diffuser). Flag: unverified | NOT BUILT | current options only brick oven / autoclave / pit and tahona / roller mill (`fields.ts:181-203`); STILL_TYPES has no clay pot (`src/db/schema.ts:1236`) | extend option lists (hand methods, diffuser, pit oven), a rule table keyed by production, preselect and lock chips; STILL_TYPES gains a value or Ancestral locks Pot (M, no migration beyond M4) |
| M6 | **Flavor** (Abocado con, Destilado con, with an ingredient list), optional, opens from More | NOT BUILT | searched `abocado`, `destilado`: none; `save.ts:260-262` accepts only `maguey` for agave | column `mezcal_flavor_method` (migration), let agave accept `flavor` ingredients, picker, "More" placement is 4C (M) |

## American whiskey

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| A1 | Straight and Bottled in Bond apply to all seven subcategories, including Tennessee | BUILT | kind walks to `american-whiskey` (`rules.ts:33-45`); hidden only when kind is not american (`rules.ts:137-141`); Tennessee under it in `src/lib/categories/tree.ts` | none |
| A2 | Tennessee copies bourbon exactly, charcoal filtering assumed | PARTLY BUILT | every field rule is by kind, so Tennessee equals bourbon; but the mashbill recipe warning keys only on slugs `bourbon` and `rye` (`expression-form.tsx:191-200`), so Tennessee gets no 51% corn warning. Charcoal filtering is an assumption with no field, nothing to build | add `tennessee` to the bourbon recipe check (S, no migration) |
| A3 | Bottled in Bond sets proof to 100 | BUILT | `rules.ts:295` `BOND_PROOF`; `expression-form.tsx:180-186`; `withBondProof` for phone edits | none |
| A4 | Must restore the typed proof when unticked | BUILT | `proofAfterBondToggle` `rules.ts:298-304` (form only; the phone patch path does not restore) | none |
| A5 | American Single Malt gets Peat | BUILT | `rules.ts:93-96` (slug `american-single-malt`) | none |
| A6 | American Single Malt has a fixed 100% malted barley mashbill | BUILT | `rules.ts:289`, `save.ts:406-407`, `label-link-pickers.tsx:MashbillPicker` | none |
| A7 | Corn and Light Whiskey get Barrel type (Uncharred, Used) | BUILT | `rules.ts:269-279` | none |

## Scotch

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| S1 | Regions | BUILT | `rules.ts:292`; text column `src/db/schema.ts:371` | none |
| S2 | Peat | BUILT | `rules.ts:93-96`, `expression-form.tsx:312` | none |
| S3 | Cooperage | BUILT | never hidden (`rules.test.ts:145`); `cooperageId` in `fields.ts` | none |
| S4 | No Entry proof, no Additive free | BUILT | `rules.ts:133-135` | none |
| S5 | Single Malt has the fixed 100% malted barley mashbill | BUILT | `rules.ts:289` (`single-malt-scotch`) | none |
| S6 | **Blended Malt** has the fixed mashbill | NOT BUILT | `isSingleMaltCategory` lists only `american-single-malt` and `single-malt-scotch` (`rules.ts:289`); `blended-malt-scotch` appears only in `tree.ts` | add the slug in `rules.ts:289` and the picker text; existing blended-malt labels pick it up on next save (S, no migration) |

## Irish, Canadian, Japanese, International, Flavored whisky (flag: spec says "not reviewed in detail")

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| W1 | Peat for Irish, Japanese, International | BUILT | `rules.ts:93-96` | none |
| W2 | Additive free and Entry proof apply (not to Scotch or American) | BUILT | `rules.ts:131-137` (Entry proof hidden for Scotch only; Additive free for Scotch and American) | none |
| W3 | Canadian distilleries Canada only, Irish Ireland and UK | BUILT | `spirit-details.ts:47-48`, used `expression-form.tsx:204` | none |
| W4 | Flavored whisky uses vodka's Flavors list | NOT BUILT | whiskey group has no ingredient picker (`label-link-pickers.tsx` IngredientPickers returns null); `save.ts:260-264` accepts no kinds for whiskey | accept `flavor` for kind `flavored-whisky`, show the flavor picker, require at least one like flavored vodka (S-M, no migration; `flavor` kind exists) |

## Gin and Genever

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| G1 | Aged toggle | BUILT | `isAgedGin` `src/db/schema.ts:347`; `rules.ts:88-90` | none |
| G2 | When Aged: Age years and months (no statement) | PARTLY BUILT | statement hidden (`rules.ts:117`); **days still shown** (`expression-form.tsx:333`; the matrix says days are conditional for gin, the spec text says years and months) | decide; hide `ageDays` for gin (S, no migration) |
| G3 | When Aged: NAS | BUILT | label `isNas` shown when aged; bottle `ginIsNas` (`bottle-applicability.ts:22,24`) | none |
| G4 | When Aged: Barrel type replaces Finish | BUILT | `rules.ts:279` (`kind === "gin" && ginAged`; genever excluded, which matches the matrix) | none |
| G5 | Single-barrel and pick links on the bottle when aged | BUILT | `bottle-form.tsx:154`, `bottle-applicability.ts:22` | none |
| G6 | Botanicals list Juniper first, then added, then "+ Botanical" | BUILT | `ingredient-picker.tsx:35`, `save.ts:276` | none |
| G7 | Style optional, not for Genever | BUILT | `rules.ts:117,119`, `GIN_STYLES` `gin-details.ts:3` | none |
| GV1 | Genever class Jonge, Oude, Korenwijn | NOT BUILT | searched `jonge`, `oude`, `korenwijn` in `src` and `drizzle`: none; Genever just hides Style (`rules.ts:117`) | show the Style select for genever with the three options (reuse `gin_style` text; check the zod enum in `schema.ts`) (S, no migration) |

## Rum

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| R1 | Aged toggle (new) | BUILT | `isAged` used by rum (`rules.ts:75`); backfill `drizzle/0056_rum_aged_backfill.sql` | none |
| R2 | Aged shows years, dates, finishes, cask strength, and the bottle follows | BUILT | `rules.ts:77-80,196`; `bottle-applicability.ts:23`; `bottle-form.tsx:155` | none |
| R3 | Solera only when Aged | NOT BUILT | `isSolera` and `soleraRange` are not in `AGING_FIELDS` (`rules.ts:49-60`); only the range hides, unless Solera is Yes (`rules.ts:145`) | add both to the unaged hide set (S, no migration) |
| R4 | Solera takes a low and a high age in years | NOT BUILT | `solera_range` is free text (`src/db/schema.ts:386`; `fields.ts:206` placeholder "1990–2015", calendar years, not ages) | columns `solera_low_years`, `solera_high_years` (numeric), two number inputs, validation low <= high, migration 0057 plus decision on the old text (rollback script, no safe auto-parse) (M) |
| R5 | Solera: no single age, months or days, no distilled / filled date; age statement stays | NOT BUILT | no solera case in `hiddenFields` | when Solera is Yes hide `ageYears`, `ageMonths`, `ageDays`, `barrelFilledOn`, `bottledOn`; same on bottle (`bottle-applicability.ts`) (S, after R3) |
| R6 | Still type, Marque, Esters, Added sugar | BUILT | `fields.ts:130-146,150-157` | none |
| R7 | Rhum Agricole: base fixed as sugarcane juice | NOT BUILT | `RUM_BASES` has Molasses, Sugarcane, Honey (`ingredient-presets.ts:14`); no agricole branch anywhere | fixed-chip like Blue Weber for tequila (`ingredient-picker.tsx:34`) and `save.ts:274`; add a "Sugarcane juice" preset (S, no migration) |
| R8 | Rhum Agricole: no Added sugar | NOT BUILT | `sugarGPerL` shown for every rum (`fields.ts:130-146`) | hide `sugarGPerL` for kind `agricole` (S) |
| R9 | Rhum Agricole: a linked Martinique distillery pre-selects Column still | NOT BUILT | `places.ts:119` lists Martinique but nothing reads it; `changeLinks` has no still hook | on distillery link change, if country is Martinique and still empty, set `stillType = column`; show as locked chip (M, no migration; the 4A Still field exists) |
| R10 | Cachaça: base fixed as sugarcane juice, Added sugar kept | NOT BUILT | as R7; Added sugar kept already holds | as R7 for kind `cachaca` (S) |
| R11 | Spiced: Flavors list | NOT BUILT | rum accepts only `rum_base` (`save.ts:260`); no flavor picker for rum | accept `flavor` for rum, flavor picker for kind `spiced-rum`, hide for other rum (S-M, no migration) |
| R12 | Spiced: Added sugar | BUILT | shown for all rum (`fields.ts:130-146`) | none |

## Cognac

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| C1 | Designation VS (2+), VSOP (4+), XO (10+) | PARTLY BUILT | manual select `fields.ts:108-111`; minimums are help text only (`spirit-details.ts:30-34`, `expression-form.tsx:363-364`) | see C2 |
| C2 | Designation filled in from the age, and from the statement text | NOT BUILT | searched `gradeFor`, `gradeFrom`, `impliedGrade`: none | pure `brandyGradeFromAge()` and a statement-text matcher, hooked like T3, shared with Armagnac and Calvados (S-M, no migration) |
| C3 | No NAS | BUILT | `rules.ts:110` | none |
| C4 | Grapes only | BUILT | `ingredientAllowed` family grape (`spirit-details.ts:56`), `ingredient-picker.tsx:51` | none |
| C5 | Grapes entered as a table of name and share (section 6 line 58) | NOT BUILT | tag list, no share: `ingredient-picker.tsx:73-80`; no `share` column on `expression_ingredients` (`src/db/schema.ts:432-438`) | shared **ingredient shares** mechanism: `share` numeric column, table UI with Share column and total, save and validation (L, migration 0057, shared with Armagnac, Calvados, Pisco) |
| C6 | Main grapes Ugni Blanc, Folle Blanche, Colombard; secondary any of those or Montils, Folignan, Sémillon, Jurançon Blanc, Meslier St-François, Sélect | PARTLY BUILT | suggestions include Ugni Blanc, Folle Blanche, Colombard, Montils (`ingredient-presets.ts:28`); no Folignan, Sémillon, Jurançon Blanc, Meslier St-François, Sélect; no main/secondary role | per-category grape lists plus a `role` (main / secondary) column on the link (M, migration with C5) |

## Armagnac

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| AR1 | Designations Blanche, VS / Three-Star, VSOP, Napoléon, XO, Hors d'Âge, Vintage / Millésimé | NOT BUILT | `BRANDY_GRADES` is only VS, VSOP, XO (`spirit-details.ts:26`); searched `napoleon`, `hors`, `blanche`, `millesime`: only a grape named "Folle Blanche" | per-kind designation lists; `brandyGrade` is a free text column, zod enum in `schema.ts:96,274` widens (M, no migration) |
| AR2 | Designation from the age | NOT BUILT | as C2 | with C2 (S) |
| AR3 | Vintage / Millésimé takes a Vintage year | NOT BUILT | no label vintage-year field; `releaseYear` is on bottle/vintage only | new `brandy_vintage_year` integer (migration), conditional input (S-M) |
| AR4 | Minimums 1, 4, 6, 10, 10 (**flag**: designer's recollection, verify) | PARTLY BUILT | code has VS 1, VSOP 4, XO 10 only (`spirit-details.ts:32`); Napoléon 6 and Hors d'Âge 10 absent | extend the table after the minimums are verified (S) |
| AR5 | No NAS | BUILT | `rules.ts:110` | none |
| AR6 | Grapes table: major Ugni Blanc, Baco 22A, Folle Blanche, Colombard; minor Clairette de Gascogne, Plant de Graisse, Meslier Saint-François, Jurançon Blanc, Blanquette de Saint-Gaudens, Mauzac | NOT BUILT | only Ugni Blanc, Folle Blanche, Colombard (and "Baco Blanc", not "Baco 22A") exist as suggestions (`ingredient-presets.ts:28`); no table | with C5 and C6 (M) |

## Calvados

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| CA1 | Appellation selector: AOC Calvados, Pays d'Auge, Domfrontais | NOT BUILT | searched `appellation`, `pays`: none | `calvados_appellation` text column (migration), select (S-M) |
| CA2 | Fruit is a table with a share per apple type (Bittersweet, Bitter, Sweet, Acidic / tart) and Pears, with Apples subtotal and Total | NOT BUILT | apple/pear family check only (`spirit-details.ts:55`, `ingredient-picker.tsx:51`); no share, no apple types (family is only `apple` / `pear`, `src/db/schema.ts:270`) | shares mechanism (C5) plus fixed rows for the five categories, subtotal and total (L, migration shared with C5) |
| CA3 | Designation from the age: Fine (2+), Vieux / Réserve (3+), VSOP / VO / Vieille Réserve (4+), XO / Napoléon / Hors d'Âge (6+), Millésime (vintage year) | PARTLY BUILT | only VS, VSOP, XO at 2, 4, 6 (`spirit-details.ts:33`); no Vieux, no Millésime, nothing derived | list per kind, derivation as C2, vintage year as AR3 (M, no extra migration) |
| CA4 | Pays d'Auge: pot still locked | NOT BUILT | no lock; Still field is free (`fields.ts:150-157`) | when CA1 = Pays d'Auge set `stillType = pot` and show a locked chip (S after CA1) |
| CA5 | Pays d'Auge: pears at most 30% (warning) | NOT BUILT | no pear share exists | warning on the fruit table (S after CA2; also needs a label-form warning channel, none exists yet) |
| CA6 | Domfrontais: column still locked | NOT BUILT | as CA4 | as CA4 (S) |
| CA7 | Domfrontais: at least 3 years (warning) | NOT BUILT | no check | warning on age (S after CA1) |
| CA8 | Domfrontais: pears at least 30% (warning) | NOT BUILT | as CA5 | as CA5 (S) |
| CA9 | No NAS | BUILT | `rules.ts:110` | none |

## Pisco

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| P1 | Grapes only, entered like a mashbill | NOT BUILT | `ingredientAllowed` has no pisco case (`spirit-details.ts:53-59`), so any fruit is accepted; no share table | grape-only rule plus the shares table (C5) (M after C5) |
| P2 | Peru grapes Quebranta, Mollar, Uvina, Negra Criolla, Italia, Moscatel, Torontel, Albilla | NOT BUILT | only Quebranta, Italia, Torrontel suggested (`ingredient-presets.ts:29`) | per-country grape lists (S) |
| P3 | Peru: one grape is a Puro, two or more an Acholado, set automatically, Peru only | NOT BUILT | searched `acholado`, `puro`: none | derived label (computed from grape count, like `strengthTier` in `rules.ts`), no stored column (S after P1) |
| P4 | Mosto Verde toggle (a style, not a grape) | NOT BUILT | searched `mosto`: none | boolean `is_mosto_verde` (migration), toggle for Peru (S-M) |
| P5 | Chile grapes Moscatel de Alejandría, Moscatel Rosada, Torontel, Moscatel de Austria, Pedro Jiménez | NOT BUILT | none present | as P2 (S) |
| P6 | Chile class from ABV: Tradicional 30%+, Especial 35%+, Reservado 40%+, Gran Pisco 43%+ | NOT BUILT | no ABV-to-class code | pure `piscoClassFromAbv()`, display and optional stored class (S, no migration if derived) |
| P7 | Chile has no Acholado | NOT BUILT | no Acholado at all | part of P3 (S) |
| P8 | Peru or Chile follows from the distillery's country | PARTLY BUILT | distillery list limited to Peru or Chile (`spirit-details.ts:46`); nothing derives the country from the linked distillery | derive from `links.distilleries` country (country is on the picker options) (S) |

## Apple brandy and Eau de Vie

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| AB1 | Apple brandy: fruit fixed as Apple | NOT BUILT | kind `apple` has no case in `ingredientAllowed` or the picker; any fruit accepted | fixed chip like T5 and `save.ts` (S, no migration) |
| AB2 | No French-country rule | BUILT | `countryForDistillery` returns true for `apple` (`spirit-details.ts:42-50`) | none |
| AB3 | No VS / VSOP / XO | BUILT | `BRANDY_MINIMUM_YEARS` has no `apple` (`rules.ts:108`) | none |
| AB4 | No minimum age | BUILT | nothing sets one | none |
| AB5 | NAS kept | BUILT | NAS hidden only for French brandy (`rules.ts:110`) | none |
| EV1 | Eau de Vie: fruit list | BUILT | `BRANDY_FRUITS` suggestions, free entry (`ingredient-presets.ts:27-34`) | none |
| EV2 | Eau de Vie: no grade | BUILT | `rules.ts:108` | none |
| EV3 | Eau de Vie: NAS kept | BUILT | `rules.ts:110` | none |

## Liqueur

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| L1 | Base and Flavors | BUILT | `label-link-pickers.tsx` (`liqueur_base`, `flavor`); `save.ts:263`; at least one flavor required `save.ts:286` | none |
| L2 | Dairy is under More | PARTLY BUILT | field exists, shown for liqueur kinds only (`fields.ts:264`, `rules.ts:130`); "More" is the 4C layout | 4C |
| L3 | Never "Dairy: Unknown" | NOT BUILT | select offers "Unknown" (`fields.ts:264`); column default `unknown` (`src/db/schema.ts:350`) | optional tick or yes/no without an Unknown label; no schema change (S) |
| L4 | On Cream, Dairy is ticked by default | NOT BUILT | no category default anywhere | default on category change to `cream-liqueur`; optional backfill migration for existing Cream labels (S) |
| L5 | Chocolate and Coffee liqueur stay | BUILT | `src/lib/categories/tree.ts` | none |

## Amaro

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| AM1 | Own field group | BUILT | `fields.ts:250-257`, `field-matrix.ts` | none |
| AM2 | Style including Aperitivo | BUILT | `AMARO_STYLES` `spirit-details.ts:4` | none |
| AM3 | Botanicals | BUILT | `label-link-pickers.tsx:IngredientPickers`, `save.ts:263` | none |
| AM4 | No distillery country or region fields | BUILT | no form field named `originCountry` or `originRegion` in `EXPRESSION_SECTIONS`; columns stay dormant by decision (`src/db/schema.ts:352-355`; `columns.ts:70` has a now-inert rule) | later migration drops columns (outside 4B) |

## Absinthe, Akvavit, Shochu (group "other")

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| O1 | Absinthe and Akvavit have a botanicals list | NOT BUILT | group `other` has no ingredient picker and accepts no kinds (`label-link-pickers.tsx`, `save.ts:260-264`); stale: `AUTOMATIC_FLAVORS.absinthe` applies only to group `liqueur` (`save.ts:242,277`) | accept `botanical` for kinds absinthe and akvavit, picker, keep Anise automatic or retire it (S-M, no migration) |
| O2 | Shochu base list: sweet potato, barley, rice | NOT BUILT | none | new ingredient kind `shochu_base` needs a migration (CHECK in `drizzle/0048_spirit_label_facts.sql:3`) plus presets; or reuse `vodka_base` with other presets (S-M) |
| O3 | Group "other" | BUILT | tree (`tree.ts`), `field-matrix-check.ts:21` | none |

## Vodka

| # | Rule | Status | Evidence | Needed (size) |
|---|---|---|---|---|
| V1 | No age fields | BUILT | `rules.ts:101,196`; `writableFields` (`fields.ts:289`) | none |
| V2 | Base | BUILT | `VODKA_BASES`, `label-link-pickers.tsx` | none |
| V3 | Flavors for Flavored Vodka | BUILT | `label-link-pickers.tsx` (`kind === "flavored-vodka"`), `save.ts:244` | none |

## Proposed tasks (NOT BUILT and PARTLY BUILT rows, grouped)

Ordered by value over size. No task depends on another except where noted. Migration numbers are the next free ones.

| # | Task | Rows | Size | Migration |
|---|---|---|---|---|
| 1 | **Age-derived class and designation** (pure functions, hooked into the label form, bottle form and phone patch): tequila and mezcal class from age, Blanco/Reposado months and days only, Cognac, Armagnac and Calvados designation from age and from statement text; per-kind designation lists (Armagnac, Calvados full set) | T2, T3, M1, C1, C2, AR1, AR2, AR4 (flag), CA3 | M | none (`brandy_grade` and `tequila_class` are text) |
| 2 | **Small rule fixes in `rules.ts`** (hide/show only): Blended Malt mashbill, Tennessee recipe warning, Solera only when Aged and its hidden fields, gin days, genever class select, Peru/Chile from distillery country | S6, A2, R3, R5, G2, GV1, P8 | S | none |
| 3 | **Rum sugarcane kinds**: Rhum Agricole and Cachaça fixed base, Agricole no Added sugar, Martinique distillery pre-selects Column still, Spiced Flavors list | R7-R11 | M | none |
| 4 | **Solera range in years**: two numeric columns, inputs, validation, decide what happens to the old text | R4 | M | 0057 (+ rollback script) |
| 5 | **Liqueur dairy**: no "Unknown", ticked on Cream (the "under More" part waits for 4C) | L3, L4, L2 | S | none (optional backfill) |
| 6 | **Flavor lists beyond liqueur and vodka**: Flavored whisky Flavors; Absinthe and Akvavit botanicals; Shochu base | W4, O1, O2 | M | one if `shochu_base` becomes a new kind (CHECK constraint) |
| 7 | **Apple brandy fixed fruit** | AB1 | S | none |
| 8 | **Mezcal production, class and flavor**: Production selector and its rules (flag: unverified), Madurado en Vidrio, Flavor (Abocado con, Destilado con) | M2, M4, M5, M6 | M-L | 0057-ish: `mezcal_production`, `mezcal_flavor_method` |
| 9 | **Ingredient shares table** (shared mechanism): `share` and `role` on `expression_ingredients`, a table UI with Share column and total, save and validation; then per-spirit lists: Cognac and Armagnac grapes (main/minor), Calvados fruit with apple types and subtotal, Pisco grapes | C5, C6, AR6, CA2, P1, P2, P5 | L | yes: share, role |
| 10 | **Calvados appellation, locks and warnings**: appellation column, pot/column lock, pears and age warnings (needs a warning channel on the label form) | CA1, CA4-CA8 | M | yes: `calvados_appellation` (after 9 for pear shares) |
| 11 | **Pisco derived values**: Puro/Acholado (Peru), Chile class from ABV, Mosto Verde toggle | P3, P4, P6, P7 | S-M | yes for Mosto Verde (boolean); the rest derived |
| 12 | **Armagnac and Calvados vintage year** | AR3 (and CA3's Millésime) | S | yes: `brandy_vintage_year` |

Suggested migration bundling: one migration for tasks 4, 8, 10, 11, 12 columns if built together; task 9 on its own (it changes a link table and needs a rollback). Verify before building: Armagnac minimums (task 1), mezcal production rules (task 8), and whether "More" placement (L2) waits for 4C.
