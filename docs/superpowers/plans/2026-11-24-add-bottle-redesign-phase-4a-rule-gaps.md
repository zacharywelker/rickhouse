# Add-bottle redesign, phase 4A: make today's form rules follow the matrix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 32 differences between the form rules and the field matrix that phase 3 recorded, without changing how the forms look.

**Architecture:** The matrix test is the specification. `src/lib/expressions/field-matrix-gaps.ts` lists the differences; each task changes a rule and deletes the entries it fixes, and `field-matrix.test.ts` (which requires the list to equal what the check finds) stays green. When the list is empty, the rules match the matrix. Retired fields leave the forms and the detail pages but their columns stay and the phone API keeps accepting them.

**Tech Stack:** TypeScript, React client components, Drizzle/Postgres hand-written migrations, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-add-bottle-redesign-design.md` (sections 4, 7, 8, 9, 12) and `2026-11-24-add-bottle-redesign-phase-4-overview.md`.

## Decisions (taken by the owner, 2026-11-24)

1. **`blend` stays a still type.** The options are Pot, Column, Coffey, 3-chamber and Blend, so `STILL_TYPES` does not change and Task 4 needs no migration.
2. **Existing aged rum:** a rum label with any age value, age statement, NAS, distilled or bottled date, or finish has the new Aged toggle switched **on**, so nothing it shows today disappears. Every other rum label starts off.
3. **Barrel type for Corn and Light whiskey:** Uncharred and Used are ordinary finishes the owner creates on first use (offered as one-click suggestions in the Barrel type chip); no new column.

## Global Constraints

- A retired field leaves the label form, the bottle form, the bulk editor's columns and the detail pages; its column, the label-patch and lookups API keys and the iOS models stay (a `.strict()` API body must not start rejecting a key the app still sends).
- Hand-written migrations with the next number (`0056`, the rum backfill; `0055` is the category tree) and a `when` later than the last journal entry; a rollback script for each that rewrites data; opt-in database tests that create and drop their own database.
- Every task deletes its `KNOWN_GAPS` entries in the same commit as the rule change and leaves `npx vitest run src/lib/expressions/__tests__/field-matrix.test.ts` green.
- `npm run lint`, `npx tsc --noEmit` and the whole vitest suite before each push; e2e only against a throwaway database whose name the spec checks **before** `resetDatabase()` (`assertThrowawayDatabase()`).
- Codex gets pure functions and vitest only, with its shell started inside its worktree, and its work is committed from the main session; Haiku gets mechanical removals; a Sonnet review follows each task; no Opus.

## Review Focus

1. A **full-form save after a field is retired** must not blank the column: a label saved from the web form keeps its old Still proof, Country, Region and Bottle count.
2. **Existing rum labels** with ages, finishes or a statement are still shown with them after the Aged toggle arrives (the backfill), and a rum label with none is not shown aging fields it never had.
3. **The phone** (old iOS builds) still creates and edits labels: kinds and keys it sends are accepted, and a retired key is ignored, not rejected.
4. **The bulk editor** reads `bottleFieldNotUsed`; moving the bottle form's rules into it changes what the bulk editor greys out for vodka, amaro and liqueur rows. Intended, but check the grid for each.
5. A rule keyed by **slug** (peat for American Single Malt) must survive an admin renaming the category (the slug is the key, not the name).

---

## Tasks

### Task 1: Retire the dead fields

Removes: Still proof (agave), Country and Region (amaro and liqueur), Bottle count (bottle), Brandy designation (bottle). Clears these gap rows: "Still proof", "Country (amaro, liqueur)", "Region (amaro, liqueur)", "Bottle count" (two entries), "Brandy designation" (bottle).

**Files:**
- Modify: `src/lib/expressions/fields.ts` (the Agave, Amaro and Liqueur detail sections), `src/lib/expressions/bottle-fields.ts`, `src/lib/expressions/rules.ts` (`STRENGTH_FLAGS`, the amaro and liqueur hidden lists), `src/components/expressions/expression-form.tsx` (the origin fields), `src/components/bulk-editor/bulk-editor.tsx` and `src/lib/bulk-editor/fields.ts` (their columns), `src/app/(app)/expressions/[id]/page.tsx` and `src/app/(app)/bottles/[id]/page.tsx` (detail pages), `src/lib/expressions/field-matrix-gaps.ts`
- Test: `src/lib/expressions/__tests__/fields.test.ts`, `src/lib/expressions/__tests__/save-retired.integration.test.ts` (new, opt-in database), `e2e/bottle-form.spec.ts` if one exists for the bottle form

**Interfaces:** none new. `writableFields(group)` stops returning the retired names for those groups.

- [ ] **Step 1: Inventory.** `grep -rn "isStillProof\|originCountry\|originRegion\|bottleCount\|brandyGrade" src ios` and list every surface in the PR description (form, bulk editor column, detail page, API, iOS). Change the first four kinds; leave the API and iOS.
- [ ] **Step 2: Failing tests.** `writableFields("agave")` does not contain `isStillProof`; `writableFields("amaro")` and `("liqueur")` contain neither `originCountry` nor `originRegion`; the bottle field list contains neither `bottleCount` nor (for a bottle form) `brandyGrade`. Database test: save a label of each group through the web save path with the retired field's old value present in the row, and check the column is unchanged afterwards (Review Focus 1). The label-patch and lookups API tests still pass a body containing each retired key.
- [ ] **Step 3: Run** `npx vitest run src/lib/expressions`. Expected: FAIL.
- [ ] **Step 4: Remove** the fields from the sections and lists above; remove their rows from `KNOWN_GAPS`. Keep `isStillProof` in `AGING_FIELDS` handling only if the rules still reference it.
- [ ] **Step 5: Verify** vitest, `tsc`, lint; run the label and bottle e2e specs against a throwaway database and look at an agave, an amaro and a liqueur form in the browser.
- [ ] **Step 6: Commit** `feat: retire Still proof, amaro and liqueur country and region, bottle count and the bottle brandy designation from the forms`.

### Task 2: Rules by kind

Clears: "Cask strength" (agave, gin), "NAS" (brandy), "Cooperage" (whiskey), "Peat" (whiskey).

**Files:**
- Modify: `src/lib/expressions/rules.ts` (`hiddenFields`, `nameFlagApplies`, `FormContext`), every caller that builds a `FormContext` (`expression-form.tsx`, `src/lib/expressions/save.ts`, `src/lib/bulk-editor/*`; the compiler finds them), `src/lib/expressions/field-matrix-gaps.ts`, `field-matrix.ts` (move the Peat undecidable note)
- Test: `src/lib/expressions/__tests__/rules.test.ts`

**Interfaces:**
- Produces: `FormContext` gains `slug: string | null` (the category's own slug; null when unknown, which leaves the field shown as today). `peatKindFor(context: Pick<FormContext, "kind" | "slug">): boolean` true for kinds `irish`, `scotch`, `japanese`, `international` and for the slug `american-single-malt`.

- [ ] **Step 1: Failing tests** (names are the assertions): `isCaskStrength` is hidden for `tequila`, `mezcal`, `gin` (aged and unaged) and `genever`, still shown for `american`, `cognac`; the name flag `cask strength` in a tequila label's name no longer ticks it (`nameSays`); `isNas` is hidden for `cognac`, `armagnac`, `calvados` and shown for `pisco`, `apple`, `eau-de-vie`; `cooperageId` is shown for `scotch` as for the other whiskeys, while `entryProof` and `isAdditiveFree` stay hidden for `scotch`; `peatStatus` is shown for `japanese`, `international`, `irish`, `scotch` and for a `american` context with slug `american-single-malt`, hidden for `american` with slug `bourbon`, `canadian` and `flavored-whisky`.
- [ ] **Step 2: Run, implement, run** until PASS. Existing rules tests must still pass unchanged except where they pinned the old behaviour (update those deliberately and say so in the commit).
- [ ] **Step 3: Delete** the four gap entries and the Peat entry in `UNDECIDABLE` (the slug key now decides it); the check's `LABEL_CONDITIONS` Peat row gains American Single Malt only if the check can pass a slug (extend `labelShown` to pass it).
- [ ] **Step 4: Verify** the whole suite, a Scotch label's form in the browser (Cooperage shows, Entry proof does not), commit `feat: cask strength, NAS, cooperage and peat follow the record`.

### Task 3: The bottle rules in one function

Clears: the "Single barrel … Age statement" entries for vodka, amaro and liqueur, "Warehouse" and "Rick / floor" (Other), "Vintage choice", and turns the "in-component" entries (Batch, Release year, Proof override, Size override) into tested rows.

**Files:**
- Modify: `src/lib/expressions/bottle-applicability.ts` (`bottleFieldNotUsed`), `src/lib/expressions/spirit-details.ts` (`hidesWarehouse`), `src/components/expressions/bottle-form.tsx` (lines 150 to 170: delete the inline conditions and call the function), `src/lib/bulk-editor/*` (where it reads the function), `src/lib/expressions/field-matrix-check.ts` (`BOTTLE_FUNCTION_FIELDS` grows to every bottle row), `field-matrix-gaps.ts`
- Test: `src/lib/expressions/__tests__/bottle-applicability.test.ts`

**Interfaces:**
- Produces: `bottleFieldNotUsed(name, label, own)` also covers `batch`, `releaseYear`, `releaseId`, `proof`, `sizeMl` and the pick, age and date fields, for every group, with the reasons the record gives ("Not used for vodka", "Only for mezcal"). `hidesWarehouse(group, kind)` is true for group `other` and for every whiskey kind except `american`, `japanese`, `international`, `flavored-whisky`.
- Consumes: the matrix rows `BOTTLE_MATRIX` as the table the test is generated from.

- [ ] **Step 1: Failing tests, generated from the matrix:** for every `BOTTLE_MATRIX` row and group with cell A or N, `bottleFieldNotUsed` returns null (A) or a reason (N) for every kind of the group (the same kinds as the check). Hand-written cases for the conditional cells: single barrel and pick fields not used for an unaged gin or an unaged rum; Vintage choice used only for mezcal among agave and not for gin.
- [ ] **Step 2: Run, implement, run** until PASS; then replace the inline conditions in `bottle-form.tsx` with `bottleFieldNotUsed` and run the bottle e2e specs (the form must look the same for every group: take a screenshot of a vodka, an amaro, a bourbon and a tequila bottle form before and after).
- [ ] **Step 3: Check the bulk editor** for a vodka, an amaro and a liqueur row (Review Focus 4) and a rum row; write down what greys out now.
- [ ] **Step 4: Expand** `BOTTLE_FUNCTION_FIELDS`, delete the gap entries, commit `refactor: the bottle form's rules live in bottleFieldNotUsed`.

### Task 4: The Still link for every spirit

Clears: "Still type" (every group except rum). No migration: `STILL_TYPES` keeps `blend`.

**Files:**
- Modify: `src/lib/expressions/fields.ts` (move `stillType` out of "Rum detail" into a More line available to every group), `src/components/expressions/expression-form.tsx`, `src/lib/expressions/field-matrix-gaps.ts`
- Test: `src/lib/expressions/__tests__/fields.test.ts`, an e2e spec for the link

**Interfaces:** `STILL_TYPES = ["pot", "column", "blend", "coffey", "3-chamber"]` as today.

- [ ] **Step 1: Failing tests:** `writableFields` contains `stillType` for all nine groups; the label schema accepts each of the five values and rejects another; a full-form save of a bourbon label with a still type keeps it.
- [ ] **Step 2: Implement** the move; the control is an optional "Still" link under More offering the five choices, not a field always drawn. Where a rule fixes the still (Pays d'Auge, Domfrontais, Rhum Agricole with a Martinique distillery; phase 4B) it will show as a locked chip instead.
- [ ] **Step 3: Verify:** the suite, and a rum, bourbon and tequila form in the browser; an existing rum label with a still type still shows it.
- [ ] **Step 4: Commit** `feat: the Still link for every spirit`.

### Task 5: The rum Aged toggle (migration 0056)

Clears: "Aged toggle" (rum). Also unblocks the "Cask strength" rum condition in `UNDECIDABLE`.

**Files:**
- Create: `drizzle/0056_rum_aged_backfill.sql`, its rollback, an opt-in database test
- Modify: `src/lib/expressions/rules.ts` (`isUnaged`, `hiddenFields`, `showsFinishes`), `src/lib/expressions/fields.ts` (the `isAged` field for rum), `expression-form.tsx` (draw the toggle where amaro and liqueur draw it), `src/lib/expressions/bottle-applicability.ts` (a rum bottle follows its label's Aged, as gin does), `bottle-form.tsx`, `src/lib/expressions/save.ts` (clear the aging fields of an unaged rum, as for gin), `field-matrix.ts` (the rum cells become checkable), `field-matrix-gaps.ts`

**Interfaces:** `isUnaged(context)` is true for `rum` when `values.isAged !== true`. `LabelFacts` gains `isAged: boolean` (replacing `isAgedGin` where the rule is the same).

- [ ] **Step 1: Failing tests:** an unaged rum hides `ageYears`, `ageMonths`, `ageDays`, `ageStatement`, `isNas`, the dates, `isCaskStrength` and the finish row; an aged rum shows them; the bottle of an unaged rum label hides the pick and age fields (`bottleFieldNotUsed`); saving an unaged rum clears its aging fields. The matrix's rum cells for Cask strength, Age years, Age days, Age statement, NAS, the dates, Single barrel and the pick fields (cell C "aged") get conditions added to `LABEL_CONDITIONS` (aged states) so they are checked.
- [ ] **Step 2: Migration test (opt-in):** rum labels with an age, a statement, NAS, a date or a finish get `is_aged = true`; a bare rum label stays false; labels of other groups are untouched; the migration is idempotent.
- [ ] **Step 3: Implement,** then look at an aged and an unaged rum label and bottle in the browser.
- [ ] **Step 4: Phone check:** old iOS builds do not send `isAged` for rum; confirm the API default leaves an existing aged label aged (the backfill) and that a label created on the phone without the key is unaged (state this in the PR).
- [ ] **Step 5: Commit** `feat: the rum Aged toggle (migration 0056)`.

### Task 6: Barrel type

Clears: "Barrel type" (agave).

**Files:**
- Modify: `src/components/expressions/label-link-pickers.tsx` (`FinishPickers`), `src/lib/expressions/rules.ts` (`showsFinishes`: false for agave and gin, which have Barrel type instead), `expression-form.tsx` (draw it in the Age row), `field-matrix.ts` (give the Barrel type row its field), `field-matrix-gaps.ts`
- Test: `src/lib/expressions/__tests__/rules.test.ts`, `e2e/finish-popup.spec.ts` style spec for the chip

**Interfaces:** `barrelTypeKind(context): boolean` true for agave (not for a mezcal whose class is Madurado en Vidrio), for an aged gin (`gin`, not `genever`) and for the slugs `corn-whiskey` and `light-whiskey`.

- [ ] **Step 1: Failing tests:** `barrelTypeKind` for each case above; `showsFinishes` is false for tequila, mezcal and gin and true for bourbon; the Finish row is labelled "Barrel type" with at most one value for these kinds, and "Uncharred" and "Used" are offered as suggestions for Corn and Light whiskey.
- [ ] **Step 2: Implement** by relabelling the existing finish data (no new column); one-click suggestions create the finish on first use.
- [ ] **Step 3: Verify** in the browser for tequila, mezcal (class Madurado en Vidrio hides it), aged and unaged gin, corn whiskey and bourbon; commit `feat: Barrel type for agave, aged gin, Corn and Light whiskey`.

### Task 7: Close out

- [ ] **Step 1:** `KNOWN_GAPS` is empty, or holds only entries that are deliberate (each with a reason). Run the whole suite, lint, `tsc`, the opt-in database tests and the e2e specs for the label and bottle forms against a throwaway database; put every count in the PRs.
- [ ] **Step 2:** Add an "As built" section to this plan and update section 13 of the design record.

---

## Suggested split of the work

Codex (pure functions, vitest only): the rule changes and tests of Task 2 and the function and generated table test of Task 3. Haiku: the mechanical removals of Task 1 once the inventory exists. The main session: the migrations and database tests (Tasks 4 and 5), the components (`expression-form.tsx`, `bottle-form.tsx`, Task 6's picker) and every browser check. A Sonnet reviewer after each task; none on Opus.

## Self-review notes

- **Spec coverage:** every entry of `KNOWN_GAPS` has a task: Cask strength, NAS, Cooperage, Peat (2); the retired fields and the bottle brandy designation (1); Aged toggle, Barrel type, Still type (5, 6, 4); the bottle entries and the in-component rows (3). The one undecided gap is peat for American Single Malt, solved by the slug key in Task 2.
- **Not verified while planning:** that no old iOS build sends `blend` or relies on rum having no `isAged` (Tasks 4 and 5 check), how many callers build a `FormContext` (Task 2: the compiler finds them), and which bulk-editor columns read each retired field (Task 1 Step 1).
- **Not in this plan:** new behaviour (Solera low and high age, Cachaça, Agricole, Spiced rum, grapes, mezcal production), the layout and the page itself; they are 4B to 4E in the overview.
- **Proportion:** each task gives the files, the signatures, the test names and the values the spec fixes; bodies are left to the implementer.

## As built (2026-11-24)

Phase 4A shipped as three stacked PRs: #413 (wave A: rules by kind, the bottle rules in `bottleFieldNotUsed`), #414 (wave B: retired fields, Still for every spirit) and #415 (wave C: rum Aged toggle, Barrel type). `KNOWN_GAPS` is empty.

- **Retired fields** leave the forms, the bulk editor and the detail pages; the columns stay dormant. A web save of a bottle strips `bottleCount` and `brandyGrade` when the form does not post them, so an existing value survives. The phone keeps writing `isStillProof` for agave.
- **Rum Aged toggle** reuses `is_aged` (amaro and liqueur's column). Migration 0056 backfills it; a phone edit that sends an age to a rum label marks it aged. The bottle rule reads `LabelFacts.isAged`.
- **Barrel type** is the finishes picker relabelled (one value, no order or months); `barrelTypeKind` decides it (agave, aged `gin`, slugs `corn-whiskey` and `light-whiskey`). Uncharred and Used are created as finishes on first click. Mezcal Madurado en Vidrio cannot be told yet (the class arrives in 4B), so every agave label shows it.
- **Left open:** rum tropical and continental years still show for an unaged rum; the retired columns are to be dropped in a later migration; the matrix check models Barrel type through a `finishLinks` pseudo-field.
