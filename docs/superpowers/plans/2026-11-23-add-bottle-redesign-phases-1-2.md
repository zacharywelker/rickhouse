# Add-bottle redesign, phases 1 and 2: walkthrough fixes and the three popups

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the small fixes found in the add-bottle walkthrough, then replace the generic popup form for finishes, distilleries and mashbills with the approved data-sheet popups.

**Architecture:** Phase 1 is four independent PRs, each starting from a failing reproduction. Phase 2 adds one shared popup shell (a dialog with a sticky footer that carries every warning) and three bespoke dialogs that `CreateWithDetailsDialog` chooses by resource. All rules (finish-type guess, country by category, place identifier, footer problems) are pure functions in `src/lib`, tested with vitest. No schema change in either phase.

**Tech Stack:** Next.js App Router, React client components, Drizzle/Postgres, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-add-bottle-redesign-design.md` (section 14 for phase 1, section 16 and the mockups `mashbill-popup.html`, `distillery-popup.html`, `finish-popup.html` for phase 2).

**Status (2026-11-24): phases 1 and 2 are built.** The tasks below are kept as written; the "As built" section at the end records what differed and what was learned. Not built: the "Distillery not disclosed" popup (Task 7 Step 5).

## Global Constraints

- Nothing the app can record today is lost. Phase 2 hides "How Known" from the form; the column and its data stay.
- Every popup warning is in the footer, left of Cancel, one amber style (`#ffe9c9` background, `#c26a00` border, `#7a3f00` text). A blocking message disables Save; a non-blocking one ends with "It will still save."
- Names are unique per owner for finishes (`finishes_owner_name_unique`) and distilleries (`distilleries_owner_name_unique`); a duplicate blocks Save and offers "Use it".
- Names are tidied (title-cased) when the field loses focus.
- Mashbills: shares must total 99 to 101 (`GRAIN_TOTAL` in `src/lib/mashbills.ts`); the category rule (bourbon at least 51% corn, rye at least 51% rye, single malt 100% malted barley) is a warning only.
- Finish pairing rules are unchanged (`docs/superpowers/specs/2026-11-08-whiskey-finish-mashbill-pairing-design.md`). With two or more mashbills no mashbill is preselected, and there is no warning for that.
- Migrations are hand-written (drizzle-kit generate fails here); none is needed in these phases.
- The Playwright and DB-backed suites do not run in CI. Each PR runs them against a scratch database and shows the counts in its description.
- One branch per task, from a fresh `origin/main`, in its own worktree. Check `gh pr list --state all --search <topic>` first.

## Review Focus

1. A money field typed `1e3` or `-5` or `.5` in a number input: the cap and pad helpers must not crash or produce `NaN` text; `.5` pads to `0.50`.
2. Bottled in Bond ticked, then proof edited by hand, then unticked: the hand-edited proof must be kept, not overwritten by the stash.
3. A finish named in mixed case or with extra spaces (`  port  CASK `): the duplicate check and the type guess must see the tidied name.
4. A distillery typed name equal to the brand with different case or a trailing "Distillery": Company is prefilled only for those two forms.
5. A mashbill with a blank ingredient row and a share, or shares as `12.5`: Save blocks on the blank name; decimals total correctly.

---

## Phase 1: walkthrough fixes

### Task 1: Money and proof take two decimals, and money pads on blur

**Files:**
- Create: `src/lib/decimals.ts`, `src/lib/__tests__/decimals.test.ts`
- Modify: `src/components/forms/field.tsx:101-120` (the text/number input), `src/components/expressions/proof-abv-field.tsx`
- Test: `e2e/admin.spec.ts` (one assertion on blur)

**Interfaces:**
- Produces: `capDecimals(value: string, places: number): string` drops digits past `places` after the first `.` and leaves everything else alone. `padDecimals(value: string, places: number): string` returns `""` for `""`, and otherwise the value with exactly `places` decimals (`"100"` to `"100.00"`, `".5"` to `"0.50"`); a value that is not a plain decimal is returned unchanged.

- [ ] **Step 1: Write the failing tests** in `decimals.test.ts`: `capDecimals("99.999", 2) === "99.99"`, `capDecimals("12", 2) === "12"`, `padDecimals("100", 2) === "100.00"`, `padDecimals(".5", 2) === "0.50"`, `padDecimals("", 2) === ""`, `padDecimals("1e3", 2) === "1e3"`, `padDecimals("117.9", 2) === "117.90"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/decimals.test.ts`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement** both functions in `src/lib/decimals.ts` (a single regex `^\d*\.?\d*$` decides "plain decimal").
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Use them.** In `field.tsx`, where `spec.money` is true, run `capDecimals(_, 2)` in `onChange` and `padDecimals(_, 2)` in `onBlur`. In `ProofAbvFields`, cap proof and ABV at 2 decimals in `onChange` and do not pad (117.9 stays 117.9). Keep the `step` attribute as is.
- [ ] **Step 6: E2E.** In `e2e/admin.spec.ts`, type `100` into MSRP on the add page, blur, and assert the value is `100.00`; type `99.999` and assert `99.99`. Run `npx playwright test e2e/admin.spec.ts --trace off`.
- [ ] **Step 7: Commit** `fix: cap money and proof at two decimals, pad money on blur`.

### Task 2: Unticking Bottled in Bond restores the earlier proof

**Files:**
- Modify: `src/lib/expressions/rules.ts` (next to `BOND_PROOF`, line 264), `src/components/expressions/expression-form.tsx:97` (`withLabelChange`) and its caller
- Test: `src/lib/expressions/__tests__/rules.test.ts`

**Interfaces:**
- Produces: `proofAfterBondToggle(input: { bonded: boolean; proof: string; stashed: string | null }): { proof: string; stashed: string | null }`. Ticking (`bonded: true`) returns `{ proof: BOND_PROOF, stashed: proof }` unless `proof` is already `BOND_PROOF`, in which case `stashed` is kept. Unticking returns `{ proof: stashed }` only when the current proof is still `BOND_PROOF` and `stashed` is not null; otherwise the proof is left alone. Unticking always returns `stashed: null`.

- [ ] **Step 1: Write the failing tests:** tick with `"117.9"` gives `{proof:"100", stashed:"117.9"}`; untick with proof `"100"`, stashed `"117.9"` gives `{proof:"117.9", stashed:null}`; untick after the proof was edited to `"101"` keeps `"101"`; untick with `stashed: null` keeps the proof; tick when proof is already `"100"` keeps an existing stash.
- [ ] **Step 2: Run** `npx vitest run src/lib/expressions/__tests__/rules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `proofAfterBondToggle` in `rules.ts`.
- [ ] **Step 4: Wire it.** Hold `stashed` in a `useRef<string | null>` inside `ExpressionFields` and call the helper where `withLabelChange` handles `isBottledInBond`; `withLabelChange` stays pure and keeps setting `BOND_PROOF` on tick. The server path (`save.ts:47`) is unchanged: it still forces 100 when the flag is on.
- [ ] **Step 5: Run** `npx vitest run src/lib/expressions` (existing `save-bond.test.ts` must still pass).
- [ ] **Step 6: Commit** `fix: restore the earlier proof when Bottled in Bond is unticked`.

### Task 3: Copy and the ABV percent sign

**Files:**
- Modify: `src/lib/expressions/fields.ts:75` (Description help text), `src/components/expressions/proof-abv-field.tsx` (ABV cell)
- Test: `src/lib/expressions/__tests__/fields.test.ts`

- [ ] **Step 1: Write the failing test:** the Description field's `help` does not contain `live here` and does contain `Distilled by`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Change the copy** to: `Anything worth knowing that has no field of its own, including what the label says as printed. Who distilled it goes in Distilled by.` (my wording, to approve in review).
- [ ] **Step 4: ABV sign.** Read the ABV input in `proof-abv-field.tsx`. If it has no `%` adornment, add one in the same style as the money `$` prefix (`MaybeMoney` in `forms/field.tsx`); if it already shows one, record that in the PR and make no change.
- [ ] **Step 5: Run** `npx vitest run src/lib/expressions/__tests__/fields.test.ts`, then commit `fix: Description help no longer contradicts Distilled by`.

### Task 4: Pasting a TTB ID fills the record, as the in-app search does

**Files:**
- Modify (after diagnosis): `src/components/expressions/cola-approvals.tsx`, `src/lib/cola/client.ts` (`lookupCola`, line 171), `src/lib/cola/store.ts` (`attachCola`, line 69)
- Test: `src/lib/cola/__tests__/parse.test.ts`

This one is investigate-first: the cause is not yet known.

- [ ] **Step 1: Reproduce.** On a scratch server, paste a real TTB ID (bare, and as a registry URL) into the label's approvals box, and attach the same approval via "Find on TTB". Record which of approval date, name, class and permit number are blank in the pasted case (screenshot of both).
- [ ] **Step 2: Diagnose.** Compare the arguments `attachCola` receives on the two paths. Name the field that differs in the PR description before changing code.
- [ ] **Step 3: Write the failing test** at the layer that owns the difference (most likely a `parse.ts` fixture of the registry detail page for the pasted path), asserting the four fields.
- [ ] **Step 4: Fix, run** `npx vitest run src/lib/cola` and repeat Step 1 until the pasted case matches the search case.
- [ ] **Step 5: Separate finding.** "The search returned nothing newer than April 2023" is logged as its own issue with the query and date range used, not fixed here.
- [ ] **Step 6: Commit** `fix: a pasted TTB ID fills the same record as the search`.

---

## Phase 2: the three popups

### Task 5: The popup shell and its footer

**Files:**
- Create: `src/components/admin/popups/popup-shell.tsx`, `src/lib/admin/popup-problems.ts`, `src/lib/admin/__tests__/popup-problems.test.ts`
- Modify: `src/components/admin/create-with-details-dialog.tsx` (renders the shell; chooses the bespoke dialog by `resource`, falling back to `ResourceForm` for companies, brands, stores, categories and tags)

**Interfaces:**
- Produces: `type Problem = { text: string; blocking: boolean; action?: { label: string; onClick: () => void } }`. `PopupShell({ title, open, onOpenChange, problems, saveLabel, saving, onSave, children })` renders the 640px dialog, the serif title, a sticky footer with the amber problems left of Cancel and Save; Save is disabled while saving or while any problem is blocking. `titleCase(name: string): string` in `popup-problems.ts` collapses spaces and capitalises each word (keeps `PX`, `NAS`, and words after an apostrophe lower-case).
- Consumes: shadcn `Dialog` already used by `CreateWithDetailsDialog`.

- [ ] **Step 1: Write the failing tests** for `titleCase`: `"  port  CASK "` gives `"Port Cask"`, `"px sherry"` gives `"PX Sherry"`, `"angel's envy"` gives `"Angel's Envy"`.
- [ ] **Step 2: Run, implement, run** until PASS.
- [ ] **Step 3: Build `PopupShell`** to the mockups' markup (`finish-popup.html`: `.dlg`, `.df`, `.amber`). Escape closes the dialog; Enter in a single-line input saves when no problem is blocking.
- [ ] **Step 4: Playwright** (`e2e/popup-shell.spec.ts`, using the existing admin login helper): open "Add details" on a distillery; the dialog is 640px wide at a 1000px viewport, and a blocking problem disables Save.
- [ ] **Step 5: Commit** `feat: popup shell with an amber footer`.

### Task 6: The finish popup

**Files:**
- Create: `src/lib/admin/finish-type.ts`, `src/lib/admin/__tests__/finish-type.test.ts`, `src/components/admin/popups/finish-dialog.tsx`
- Modify: `src/app/(app)/admin/actions.ts:90` (`QUICK_CREATE_DEFAULTS.finishes`), `src/components/admin/create-with-details-dialog.tsx`
- Test: `e2e/finish-popup.spec.ts`

**Interfaces:**
- Consumes: `FinishType` and `FINISH_TYPES` from `src/db/schema.ts`; `PopupShell`, `Problem`, `titleCase` (Task 5); `saveResourceAction` (bound as in `resource-form.tsx:42`).
- Produces: `inferFinishType(name: string): FinishType | null`. Rules in order: spirit words (`cognac|brandy|armagnac|calvados|rum|tequila|mezcal|whisk`) give `spirit`; beer words (`beer|stout|ipa|bock|ale|porter|lager`) give `beer`; fortified words (`port|sherry|madeira|marsala|oloroso|pedro|px|vermouth|fortified`) give `fortified`; wine words (`wine|bordeaux|burgundy|sauternes|rioja|cabernet|merlot|zinfandel|pinot|champagne|naranja`) give `wine`; wood words (`oak|wood|cherry|maple|acacia|chestnut|cedar`) give `wood`; otherwise `null`. Whole-word, case-insensitive. `quickCreateAction("finishes", name)` uses `inferFinishType(name) ?? "other"`.

- [ ] **Step 1: Write the failing tests:** `"Tawny Port Cask"` gives `fortified`; `"French Oak"` gives `wood`; `"Cognac"` gives `spirit`; `"Winter Bock"` gives `beer`; `"Mystery"` gives `null`; `"Portugal"` gives `null` (whole word); `"Port"` gives `fortified`.
- [ ] **Step 2: Run, implement, run** until PASS.
- [ ] **Step 3: Quick create.** Change the `finishes` default in `actions.ts` to use `inferFinishType`. Add an integration assertion beside the existing admin integration tests that creating `"PX Sherry"` by name gives type `fortified`.
- [ ] **Step 4: Build `FinishDialog`.** Title `Add finish`, or `Add cask type` for the kinds that call it a cask type (`CASK_TYPE_KINDS`, `label-link-pickers.tsx:29`). Name prefilled with the typed text; Type as six toggle chips, one on, suggested from the name until the user picks, marked `suggested`; Notes under a More link. Problems (see mockup): `Give it a name.`, `Pick a type.` (blocking), and a duplicate name (blocking, action `Use it` hands the existing option back).
- [ ] **Step 5: E2E** for the mockup's scenarios: typing `Tawny port cask` suggests Fortified; a typed `Port` shows the duplicate problem and Save is disabled; Save adds the finish to the picker.
- [ ] **Step 6: Commit** `feat: add-finish popup, with the type guessed from the name`.

### Task 7: The distillery popup

**Files:**
- Create: `src/lib/admin/distillery-defaults.ts`, `src/lib/admin/__tests__/distillery-defaults.test.ts`, `src/components/admin/popups/distillery-dialog.tsx`
- Modify: `src/components/expressions/label-link-pickers.tsx:46` (replace the inline country ternary), `src/lib/admin/registry.ts:563` (hide "How Known" from the form only), `src/components/admin/create-with-details-dialog.tsx`
- Test: `e2e/distillery-popup.spec.ts`

**Interfaces:**
- Consumes: `normalizeState`, `normalizeCountry`, `normalizePlace`, `undisclosedName`, `HOME_COUNTRY`, `US_STATES` from `src/lib/places.ts`; `CategoryKind` from `rules.ts`; `isAgaveKind`.
- Produces: `countryForKind(kind: CategoryKind): string | null` (agave `Mexico`, cognac/armagnac/calvados `France`, pisco `Peru`, canadian `Canada`, irish `Ireland`, scotch `Scotland`, american `USA`, else `null`). `placeIdentifier(kind: CategoryKind, country: string): "dsp" | "nom" | "region" | null` (`nom` for agave kinds or country Mexico, `region` for scotch or country Scotland, `dsp` for country USA, else `null`). `companyPrefill(typedName: string, brandName: string | null): boolean` is true only when the typed name equals the brand, or `"<brand> distillery"`, ignoring case and extra spaces.

- [ ] **Step 1: Write the failing tests** for the three functions with the values above, plus `companyPrefill("lost lantern  distillery", "Lost Lantern") === true`, `companyPrefill("Lost Lantern Co", "Lost Lantern") === false`, `placeIdentifier("tequila", "Mexico") === "nom"`, `placeIdentifier("american", "USA") === "dsp"`.
- [ ] **Step 2: Run, implement, run** until PASS. Replace the ternary in `label-link-pickers.tsx` with `countryForKind(kind)`; the `quickCreateAction` distillery default (`USA`) becomes the country from the same function when the picker passes it.
- [ ] **Step 3: Build `DistilleryDialog`.** Name, Company (prefilled by `companyPrefill`), then one Place line: City, State, Country, plus the single identifier chip from `placeIdentifier` (DSP, NOM or Region as a select). More: Founded, Defunct (toggle chip), Other old names, Notes. Problems: no name (blocking); duplicate name (blocking, `Use it`); country that does not fit the spirit (non-blocking, ends `It will still save.`). State is normalised on blur with `normalizeState` (US only).
- [ ] **Step 4: Hide "How Known"** from the registry form definition (field stays in the table and in existing rows). Run `npx vitest run src/lib/admin` to confirm no schema test depended on it.
- [ ] **Step 5: Not-disclosed popup.** Read `undisclosed-tick.tsx` and how undisclosed distilleries are stored first, then restyle that flow as the small popup in `distillery-popup.html` (City optional, State, Country; shows `Will be saved as <undisclosedName(...)>` and whether an existing one is reused). Storage behaviour must not change; add a test if `undisclosedName` reuse is not already covered.
- [ ] **Step 6: E2E** for the mockup scenarios: Scotch label shows Region and `Scotland`; agave label shows NOM and `Mexico`; typing `KY` then leaving the field gives `Kentucky`; duplicate `Far North Spirits` blocks Save.
- [ ] **Step 7: Commit** `feat: add-distillery popup with a one-line place`.

### Task 8: The mashbill popup

**Files:**
- Create: `src/components/admin/popups/mashbill-dialog.tsx`
- Modify: `src/lib/mashbills.ts` (add `mashbillProblems`), `src/components/admin/create-with-details-dialog.tsx`
- Test: `src/lib/__tests__/mashbills.test.ts`, `e2e/mashbill-popup.spec.ts`

**Interfaces:**
- Consumes: `Grain`, `sumGrains`, `GRAIN_TOTAL`, `matchesMashbillCategory`, `COMMON_GRAINS`, `normalizeGrainName`, `ingredientColor`, `describeMashbill` (all in `src/lib/mashbills.ts`); `grain-editor.tsx` for the existing table behaviour.
- Produces: `mashbillProblems(input: { kind: "secret" | "generic" | "partial" | null; name: string; grains: readonly Grain[]; category: string | null }): Problem[]` (the `Problem` type from Task 5; kept free of React). Blocking: total over or short of 100 (text names how many points), a Secret or Generic mashbill with no name, an ingredient row with a share but no name. Non-blocking: `matchesMashbillCategory` false, text ending `It will still save.`

- [ ] **Step 1: Write the failing tests:** 75/13/12 gives no problems; 75/13/10 gives one blocking problem containing `2%`; Secret with empty name gives a blocking name problem; bourbon with corn 40 gives a non-blocking problem; a grain row `{ grain: "", percent: 12 }` gives a blocking problem; `12.5` and `87.5` total 100.
- [ ] **Step 2: Run, implement, run** until PASS.
- [ ] **Step 3: Build `MashbillDialog`:** toggle chips Secret, Generic style, Partial disclosure with one explanatory line; Name only for Secret or Generic; the ingredients table with colour dot and Share; `+ Add an ingredient` as a plain dashed button adding a blank row with typeahead from `COMMON_GRAINS`; total, bar, legend and `Reads as` from `describeMashbill`; Notes under More. Names tidied with `titleCase` on every row except the one being typed.
- [ ] **Step 4: Check, read-only:** after saving a recipe that breaks its category rule, is it still offered in the label's mashbill list? Record the answer in the PR; fix only if it is hidden.
- [ ] **Step 5: E2E** for the mockup scenarios: corn 40 on a bourbon label shows the amber category warning and Save still works; a share of 60 blocks Save with the 100% problem.
- [ ] **Step 6: Commit** `feat: add-mashbill popup with toggle chips and footer warnings`.

### Task 9: Close out phase 2

**Files:**
- Modify: `docs/superpowers/specs/2026-11-23-add-bottle-redesign-design.md` (section 16 status line), `README.md` of the mockups folder if file names changed

- [ ] **Step 1:** Run `npm test`, `npx tsc --noEmit`, and the three popup e2e specs against a scratch database; put the counts in each PR.
- [ ] **Step 2:** Replace any remaining `Add details` usages that bypass `CreateWithDetailsDialog` (grep `ResourceForm` for `distilleries`, `finishes`, `mashbills`) so no path still opens the generic form for these three.
- [ ] **Step 3:** Open a short issue for the dormant "How Known" column (drop later, with the other retired columns in spec section 12, item 1).

---

## Self-review notes

- **Spec coverage:** section 14's eight items map to Tasks 1 to 4 (decimals and ABV sign: 1 and 3; Bond restore: 2; Description: 3; TTB paste and search: 4). Three items are deliberately not here: the "Vintage" naming clash, vintage prefill, and the retired whiskey fields (they belong with phase 3 and 4, where the form is rebuilt). Section 16's three popups map to Tasks 5 to 8.
- **Verified in code while planning:** finish and distillery names are unique per owner (`schema.ts`); popups today are the generic `ResourceForm` inside `CreateWithDetailsDialog`; `places.ts` and `mashbills.ts` already hold most of the rules the popups need.
- **Not verified, marked in the tasks:** the cause of the TTB paste gap (Task 4 diagnoses first), whether the ABV `%` is already drawn (Task 3), how undisclosed distilleries are stored (Task 7, Step 5), and whether a rule-breaking recipe is hidden from the label's list (Task 8, Step 4).
- **Proportion:** the tasks give signatures, test cases and values from the spec and leave bodies to the implementer.


---

## As built

| Task | PR | Written by | Reviewed by |
|---|---|---|---|
| 1 Decimals | #397 | Haiku | Sonnet, then Codex on GitHub |
| 2 Bottled in Bond | #398 | Codex | Sonnet |
| 3 Copy and ABV `%` | #396 | Haiku | Sonnet |
| 4 TTB paste | #399 | main session | Codex on GitHub |
| 5 Popup shell, 6 Finish popup | #402 | main session, `inferFinishType` by Codex | Sonnet, Codex on GitHub |
| 7 Distillery popup | #403 | main session, defaults by Codex | Sonnet, Codex on GitHub |
| 8 Mashbill popup | #404 | main session, `mashbillProblems` by Codex | Sonnet, Codex on GitHub |
| 9 Close-out | this update | | |

**Where the build differs from the tasks**

- **Task 4:** the cause was not on the server. A pasted ID on New Label is held as a bare stub (`stubCola`), so the Approved, Name, Class and Permit cells showed dashes until the label was saved; both paths already fetched the record the same way afterwards. The fix reads the record page for a stub (`previewColaAction`, `previewCola`) and fills the row. It was **not run against the live registry** (this machine cannot reach ttbonline.gov), only against saved registry pages. The search returning nothing newer than April 2023 is issue #400.
- **Task 1:** `capDecimals` leaves exponent form (`1.25e2`) alone; cutting it changed the number's value (Codex review).
- **Task 5 and 6** shipped together: the shell had no user until the finish popup. The shell's e2e check is part of `e2e/finish-popup.spec.ts`. `Problem` gained a `notice` flag, and the popup body is mounted only while open (a lint rule forbids setting state in an effect).
- **Task 7:** `placeIdentifier` takes the country only, not the spirit (the plan's `(kind, country)` signature did not match what the save keeps). The `label-link-pickers` country ternary was replaced only together with the dialog, because a picker with a default country used to turn name-only create off. "How Known" was **not** hidden in `registry.ts` (Step 4): the popup omits `disclosure` and the schema saves it as "named". Step 5 (the not-disclosed popup) was not done.
- **Task 8:** `mashbillProblems` takes `{ isSecret, isGeneric, isPartial, name, grains, category }` instead of one `kind`, because the three states are separate toggles. The category warning says the recipe is not added to the label.
- **A reset guard:** every new e2e spec calls `assertThrowawayDatabase()` (from `e2e/support/tournament-field.ts`) **before** `resetDatabase()`. Older specs (for example `finish-pairs.spec.ts`) check afterwards and are still to be fixed.

**Running the work (for the next plan)**

- Codex can only write inside the worktree that was the session's working directory when it started, cannot write `.git`, and has no localhost: give it pure functions and vitest only, start it with the shell already in its worktree, and commit its files from the main session.
- Run `npm run lint` as well as `tsc` and vitest before every push; CI runs all three (a setState-in-effect error was only caught there).
- Throwaway database for e2e: never source the main `.env` in a shell that later runs `reset.ts`; print the database name from the `DATABASE_URL` the script will see and stop unless it names the throwaway one (see the note on `--env-file` not overriding the environment).
- Each Sonnet review found at least one real bug that the author's own tests had missed (a stuck Save after a thrown save, a DSP number saved as a NOM, Enter in a nested popup saving the one behind it, a nameless row reaching the server), so the review step is worth keeping.
