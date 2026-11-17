# Bulk editor: one value per field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bulk editor shows one Proof, Size, Age and spirit-override value per row, taken from the bottle, else its vintage, else the label; marks where it came from; and writes an edit to the level the person chooses.

**Architecture:** A pure resolver (`resolve.ts`) turns a row plus the loaded vintages into a value, its level and its marker. A pure scope module decides which levels a row offers and where an edit starts. Edits gain a third key kind (`v<releaseId>`) next to the existing `b…` (bottle) and `l…` (label), saved through a new vintage patch beside the existing bottle and label patches. The editor component gains a short note, Alt+Down rotation, a vintage Create option, and an Undo notice.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Drizzle + postgres-js, vitest (DB-backed `*.integration.test.ts` need `TOURNAMENT_TEST_DATABASE_URL`), Playwright (`e2e/bulk-editor.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-16-bulk-editor-one-value-design.md` (approved 2026-11-16). Mockups: https://claude.ai/artifact/HRda9YW7eE2TEXVvPJyYJa

## Global Constraints

- No schema change and no migration. Vintages are `expression_releases` rows; bottle overrides are existing nullable `bottles` columns.
- The word for a known release in the UI is **Vintage**. Code may keep `release`.
- Marker tags are the letters **V** (vintage), **SB** (single barrel), **PS** (private selection), **SB PS** (both), **B** (a bottle's own value on an ordinary bottle). They render upright, never italic, and have a hover title in words. A label's own value has no marker.
- The scope key is **Alt+Down** (Option+Down on a Mac) to step on and **Alt+Up** to step back, the same on every OS. The note says "Option" on a Mac and "Alt" elsewhere, read from the browser's platform. Tab, Enter and Ctrl+Enter keep their present meaning.
- The edit note is one short phrase plus a key chip: "2025A vintage · 2 bottles", "Label · 6 bottles", "Only this bottle". It appears only while a cell is being edited.
- New-row column order: **Brand, Label, Category, Vintage, Single barrel, Private selection**, then Size, Proof (ABV next to it), Age (Y, M, D, statement), then the rest as now. Single barrel and Private selection are two yes/no columns.
- A label whose value is empty and whose vintages disagree shows **"Varies"**, display-only: sorts and filters as blank, copies as blank.
- The late-marking notice has an outlined **Undo** button in the app's button style, names the bottle ("Barrell Craft Spirits · Cask Select: …"), fades after about 10 seconds (paused while the pointer or focus is on it), is announced to screen readers, and sits in the existing bottom-right notice area; two notices stack, newest on top.
- Size, tequila class, brandy grade and gin NAS have no vintage value: they resolve bottle, then label, and rotate between those two only.
- A derived age (for example Straight implying two years) applies only at the label level and only where no bottle or vintage value exists.
- Each task below is one stacked PR from fresh `origin/main` (`git fetch origin` first). Verify against a scratch database named `rickhouse_bulkeditor_test`; assert the name before running `scripts/reset.ts`. The worktree's `node_modules` may be stale: `npm install --no-save --ignore-scripts zod@4.6.7` if `tsc` reports `unwrap`.

## Review Focus

Inputs and conditions the spec implies that no single task owns, most likely first. Each has its test in the named task.

1. A vintage with no proof of its own: a bottle on it shows the label's proof with no V marker, not a blank or the vintage's blank (Task 2).
2. Clearing a value at one level (typing blank at the vintage) makes the next level show through, with the marker following (Task 5).
3. Vintages that all share one proof do not read "Varies" (Task 2).
4. A paste across bottles of one vintage writes the vintage once and the paste notice says how many bottles it reached, never silently (Task 6).
5. A vintage deleted in another tab while an edit to it is pending: the save is refused as gone and the row is blocked with the existing notice (Task 5).
6. Alt+Down on a new, unsaved row does nothing, since it offers no choice (Task 6).
7. A second tab or the phone adds a bottle to a label between marking and saving: the safety net does not fire (Task 8).

---

### Task 1: Vintage values reach the sheet

**Files:**
- Modify: `src/lib/bulk-editor/load.ts` (the `releaseRows` query and the returned object)
- Modify: `src/lib/bulk-editor/sheet.ts` (types)
- Test: `src/lib/bulk-editor/__tests__/load.integration.test.ts`

**Interfaces:**
- Produces: `type SheetVintage = { id: number; labelId: number; name: string; proof: string | null; ageYears: string | null; ageMonths: number | null; ageDays: number | null; ageStatement: string | null; ageYearsSource: "entered" | "derived" }` and `loadSheet(...)` returning `vintages: SheetVintage[]` (the owner's, ordered by label then name).

- [ ] **Step 1: Write the failing test** `loadSheet returns each vintage's own proof and age` in `load.integration.test.ts`: seed one label with two releases (112 proof 7y; 107.4 proof 8y) through the existing seeding helper in that file, call `loadSheet(ownerId)`, and assert `vintages` has both with `proof` `"112"`/`"107.4"` and `ageYears` `"7"`/`"8"`, and that another owner's vintages are absent.
- [ ] **Step 2: Run it and see it fail.** `TOURNAMENT_TEST_DATABASE_URL=… npx vitest run src/lib/bulk-editor/__tests__/load.integration.test.ts` fails with `vintages` undefined.
- [ ] **Step 3: Implement.** Extend the `releaseRows` select with `proof, ageYears, ageMonths, ageDays, ageStatement, ageYearsSource` and return them as `vintages`; add `SheetVintage` to `sheet.ts`. The existing `refs.releases` (id and name) stays as it is.
- [ ] **Step 4: Run the test; it passes.** Also `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `Bulk editor: load each vintage's proof and age`.

### Task 2: The resolver

**Files:**
- Create: `src/lib/bulk-editor/resolve.ts`
- Test: `src/lib/bulk-editor/__tests__/resolve.test.ts`
- Modify: `src/lib/bulk-editor/sheet.ts` (`SheetContext` gains `index?: SheetIndex`)

**Interfaces:**
- Consumes: `SheetRow`, `SheetLabel`, `SheetBottle`, `SheetVintage`, `SheetContext`, `ageSummary` from `age.ts`.
- Produces:
  - `type Level = "bottle" | "vintage" | "label"`
  - `type ValueField = "proof" | "sizeMl" | "ageYears" | "ageMonths" | "ageDays" | "ageStatement" | "tequilaClass" | "brandyGrade" | "ginIsNas"`
  - `type Marker = "V" | "SB" | "PS" | "SB PS" | "B"`
  - `type Resolved = { value: string | null; level: Level; marker: Marker | null; varies: boolean; derived: boolean }`
  - `indexSheet(labels: ReadonlyArray<SheetLabel>, bottles: ReadonlyArray<SheetBottle>, vintages: ReadonlyArray<SheetVintage>): SheetIndex`
  - `resolve(field: ValueField, row: SheetRow, ctx: SheetContext): Resolved`
  - `markerFor(row: SheetRow, level: Level): Marker | null` (`bottle` level on a single barrel or private selection gives SB, PS or SB PS; on an ordinary bottle gives B; `vintage` gives V; `label` gives null)

- [ ] **Step 1: Write the failing tests** in `resolve.test.ts`, one `it` each, with these assertions:
  - bottle with its own proof 119 on vintage 112 on label 90 → `{ value: "119", level: "bottle", marker: "B" }`; the same bottle flagged private selection → marker `"PS"`; both flags → `"SB PS"`.
  - bottle with no own proof on a vintage with proof 112 → `{ value: "112", level: "vintage", marker: "V" }`.
  - bottle on a vintage whose proof is null, label 90 → `{ value: "90", level: "label", marker: null }` (Review Focus 1).
  - the Pinhook case: label Straight (implies 2 years), vintage `ageYears` "7" → `value "7"`, `level "vintage"`, `derived false`; with no vintage and no bottle age → `derived true`, `level "label"`.
  - a labels-only row (`bottle: null`) whose label proof is null and whose two vintages are 112 and 107.4 → `varies true`, `value null`; the same with both 112 → `varies false` and `value null` (Review Focus 3).
  - a cask-strength label with no proof whose bottles' own proofs are 110 and 118 → `varies true`.
  - `sizeMl` on a vintage bottle skips the vintage level (bottle, else label).
- [ ] **Step 2: Run** `npx vitest run src/lib/bulk-editor/__tests__/resolve.test.ts`; all fail (module missing).
- [ ] **Step 3: Implement** `resolve.ts`. Vintage fields exist only for `proof` and the four age fields; every other `ValueField` goes bottle then label. The label-level derived age comes from `ageSummary` and is used last. `indexSheet` builds `vintagesById`, `vintagesByLabel` and `ownValuesByLabel` once, not per cell.
- [ ] **Step 4: Run; pass.** `tsc` clean.
- [ ] **Step 5: Commit** `Bulk editor: resolve a value from the bottle, its vintage, or the label`.

### Task 3: One column each, in the new order

**Files:**
- Modify: `src/lib/bulk-editor/sheet.ts` (`BY_HAND`, `SHEET_COLUMNS`, `columnsFor`, `SheetColumn.group`)
- Modify: `src/lib/bulk-editor/age.ts` (one set of age columns that reads `resolve`; `BOTTLE_AGE` and `ownAgeSummary` go)
- Modify: `src/lib/bulk-editor/editors.ts` and `fields.ts` (drop `ownProof`, `ownSize` and the bottle age editors; the single columns get editors whose target is chosen at edit time, wired in Task 5)
- Modify: `src/lib/bulk-editor/find.ts` (sort and filter by the resolved value; "Varies" sorts as blank)
- Modify: `src/lib/bulk-editor/clipboard.ts` or `save.ts` copy path (a Varies cell copies as blank)
- Modify: `src/components/bulk-editor/bulk-editor.tsx` (header captions for the new order)
- Test: `sheet.test.ts`, `age.test.ts`, `find.test.ts`, `editors.test.ts`, `e2e/bulk-editor.spec.ts`

**Interfaces:**
- Consumes: `resolve` (Task 2).
- Produces: column ids `"vintage"` (the existing release column, relabelled), `"singleBarrel"` and `"privateSelection"` (two columns replacing the combined one), `"sizeMl"`, `"proof"`, `"abv"`, `"ageYears"`, `"ageMonths"`, `"ageDays"`, `"ageStatement"`; `SheetColumn.group` gains `"value"`, shown in every view. A `Cell` gains `marker?: Marker`.

- [ ] **Step 1: Write the failing tests:** `columnsFor` returns, for each of the three views, ids in the order `brand, name, category, vintage, singleBarrel, privateSelection, sizeMl, proof, abv, ageYears, ageMonths, ageDays, ageStatement` before the rest, and returns no `ownProof`, `ownSize` or bottle age ids; a Cell for the Pinhook vintage bottle has text `"112"` and `marker "V"`; sorting by proof orders by the resolved value; a Varies cell's sort key is blank.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement** the column changes. The Cask / BiB cell stays where it is. Header captions follow contiguous runs of the same group (decide how `bulk-editor.tsx` draws them today and keep that behaviour with the new interleaving; the `value` group draws no caption of its own). Replace the e2e specs that used the removed columns.
- [ ] **Step 4: Run** the unit tests and `E2E_BASE_URL=http://localhost:1965 npx playwright test e2e/bulk-editor.spec.ts`; pass.
- [ ] **Step 5: Commit** `Bulk editor: one Proof, Size and Age column in the new order`.

### Task 4: The source marker

**Files:**
- Create: `src/components/bulk-editor/source-tag.tsx`
- Modify: `src/components/bulk-editor/bulk-editor.tsx` (draw `cell.marker` in the cell, before the text)
- Test: `e2e/bulk-editor.spec.ts`; component check via the existing Playwright run

**Interfaces:**
- Produces: `SourceTag({ marker }: { marker: Marker })`, a `<span>` with the letters, `not-italic`, a `title` ("From the vintage", "Single barrel", "Private selection", "Single barrel and private selection", "This bottle's own value") and `aria-label` of the same words.

- [ ] **Step 1: Write the failing e2e** `a vintage value wears a V tag and a label's own value wears none`: in a seeded sheet with a vintage bottle and a plain bottle, the vintage bottle's proof cell contains a `[title="From the vintage"]` element and the plain bottle's has none; the tag's computed `font-style` is `normal` even inside an italic (inferred) cell.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement** `SourceTag` and draw it. Colour is not the signal: neutral muted background, small, readable in both themes.
- [ ] **Step 4: Run; pass.** Take a light and a dark screenshot of the sheet and confirm the tags read at 1x.
- [ ] **Step 5: Commit** `Bulk editor: tag values that do not come from the label`.

### Task 5: Scope, and where an edit lands

**Files:**
- Create: `src/lib/bulk-editor/scope.ts`
- Modify: `changes.ts` (`editKey`, `applyEdits`, `buildChanges`, new `VintageChange`)
- Modify: `rows.ts` (new `patchVintageRow`), `src/app/(app)/bulk-editor/actions.ts` (new `patchVintageRowAction`)
- Modify: `src/lib/releases-store.ts` (`saveRelease` can write `ageStatement` if it cannot now)
- Modify: `src/components/bulk-editor/use-row-saver.ts` (send vintage changes like label changes)
- Test: `scope.test.ts`, `changes.test.ts`, `rows.integration.test.ts`

**Interfaces:**
- Consumes: `Level`, `resolve` (Task 2).
- Produces:
  - `scopesFor(row: SheetRow): Level[]`, narrowest first: `["bottle","vintage","label"]` for a bottle on a vintage, `["bottle","label"]` otherwise; `[]` for a new unsaved row; for the size, tequila class, brandy grade and gin NAS fields the vintage level is dropped (`scopesFor(row, field?: ValueField)`).
  - `defaultScope(row: SheetRow): Level`: bottle if single barrel or private selection, else vintage if it has one, else label.
  - `nextScope(levels: Level[], current: Level, step: 1 | -1): Level`, wrapping.
  - `editKey(row, editor, level?)` returns `b<id>`/the row key for `bottle`, `v<releaseId>` for `vintage`, `l<labelId>` for `label`.
  - `type VintageChange = { releaseId: number; labelId: number; fields: Record<string, string>; bottles: number }`; `Changes` gains `vintages: VintageChange[]`.
  - `patchVintageRow(ownerId: number, releaseId: number, raw: unknown): Promise<PatchOutcome>`, `patchVintageRowAction(releaseId: number, raw: unknown): Promise<PatchOutcome>`; an unknown or foreign release returns `{ ok: false, kind: "gone" }`.

- [ ] **Step 1: Write the failing tests:**
  - `scope.test.ts`: the table from the spec's decision 2 as assertions (`defaultScope` for a pick on a vintage is `"bottle"`; for a vintage bottle `"vintage"`; for a plain bottle `"label"`); `scopesFor` of a vintage bottle for `proof` is `["bottle","vintage","label"]` and for `sizeMl` is `["bottle","label"]`; `scopesFor` of a draft is `[]` (Review Focus 6); `nextScope(["bottle","vintage","label"], "label", 1)` is `"bottle"`, and with `-1` from `"bottle"` is `"label"`.
  - `changes.test.ts`: an edit under `v7` produces one `VintageChange` with the label's `bottleCount` for that release's bottles; clearing a value at the vintage (blank) is a change with that field `""` and `resolve` then shows the label's value (Review Focus 2).
  - `rows.integration.test.ts`: `patchVintageRow` sets a release's proof and leaves its siblings and the label untouched; for another owner's release it returns `kind: "gone"` (Review Focus 5); typing into a label cell that reads "Varies" through `patchLabelRow` sets the label's proof and changes no vintage.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement** the four pieces. `patchVintageRow` validates with `parseReleaseRow` via `saveRelease`; the bottle patch and label patch already exist and are reused for the other two levels. The saver treats a `v…` key as a vintage request and reports a `gone` result through the existing blocked-row path.
- [ ] **Step 4: Run; pass,** including `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `Bulk editor: edits land on the bottle, its vintage or the label`.

### Task 6: The short note, rotation and the OS-aware key

**Files:**
- Create: `src/components/bulk-editor/edit-note.tsx`, `src/lib/platform.ts`
- Modify: `bulk-editor.tsx` (`ActiveEditor`, `finish`, the editing state `openEditor`, `railReach`), `rail-panel.tsx` (the source sentence), `src/lib/bulk-editor/rail.ts` if the sentence is built there
- Modify: paste path in `bulk-editor.tsx` (`onPaste`) and its notice
- Test: `platform.test.ts`, `e2e/bulk-editor.spec.ts`

**Interfaces:**
- Consumes: `scopesFor`, `defaultScope`, `nextScope`, `editKey` (Task 5).
- Produces: `platformKeyName(): "Option" | "Alt"` (reads `navigator.userAgentData?.platform`, else `navigator.platform`, else `"Alt"` where there is no `navigator`); `EditNote({ level, vintageName, bottles, keyName, onStep }: …)` drawing "2025A vintage · 2 bottles [Alt ↕]" / "Label · 6 bottles [Alt ↕]" / "Only this bottle [Alt ↕]"; `openEditor` gains `scope: Level`.

- [ ] **Step 1: Write the failing tests:** `platform.test.ts`: with `userAgentData.platform "macOS"` the name is `"Option"`, with `"Windows"` and with no navigator it is `"Alt"`. e2e `Alt+Down steps the scope and the note follows`: on a vintage bottle's proof cell typing opens the note "2025A vintage · 2 bottles"; `Alt+ArrowDown` shows "Label · N bottles", again "Only this bottle", again the vintage; `Alt+ArrowUp` goes back; Tab still moves to the next cell and Enter to the next row; committing at "Only this bottle" leaves the vintage's other bottles unchanged after a reload; Alt+Down on a new row's proof cell does nothing (Review Focus 6). e2e `pasting three values onto three bottles of one vintage says it changed the vintage` (Review Focus 4).
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.** Replace `changesText` and the `reach` plumbing with `EditNote`; set `scope` from `defaultScope` when an editor opens; `Alt+ArrowDown`/`Alt+ArrowUp` in `ActiveEditor`'s key handler call `preventDefault` and `nextScope`; clicking the note steps on. `finish` writes the edit under `editKey(row, editor, scope)`. The details pane says where the selected value comes from in full ("Typing changes the 2025A vintage (2 bottles)"). A paste writes at each row's default scope and its notice names how many bottles a shared level reached.
- [ ] **Step 4: Run** the unit tests and the full `bulk-editor.spec.ts`; update the specs that asserted "Changes N bottles".
- [ ] **Step 5: Commit** `Bulk editor: a short note and Alt+Down to choose what an edit changes`.

### Task 7: Creating a vintage from the bottle row

**Files:**
- Modify: `src/lib/bulk-editor/editors.ts` (`ComboKind` gains `"vintage"`), `suggest.ts` consumers, `references.ts`
- Modify: `src/lib/bulk-editor/reference-rows.ts` (new `ensureVintage`), `rows.ts` (`createRow`, `patchBottleRow` accept `vintage: { id } | { name }`)
- Modify: `combo-editor.tsx` (list cap for vintages, the Create option)
- Test: `references.test.ts`, `references.integration.test.ts`, `e2e/bulk-editor.spec.ts`

**Interfaces:**
- Produces: `ensureVintage(tx: Tx, ownerId: number, labelId: number, name: string): Promise<{ id: number; created: boolean }>` using the advisory-lock pattern of `ensureStore`, and a unique vintage per label and name (case-insensitive).

- [ ] **Step 1: Write the failing tests:** integration `two saves of the same new vintage name make one vintage`; `createRow` with a new label and `vintage: { name: "2025A" }` creates the release and sets `bottles.releaseId`; e2e `Create vintage "2026" makes it with Enter or Ctrl+Enter, and a typo near "2025A" is offered first as a close match`. Also: `createRow` for an existing label with `vintage: { name: "2026" }` and a typed proof puts the proof on the new vintage and not on the label; the same for a new label, whose own proof stays null; the note on such a row reads "2026 vintage (new) · 1 bottle".
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.** The Vintage cell uses the existing combo with `allowCreate` true; a name needs nothing else and the year is left empty. The vintage and the bottle save in one transaction, with the rollback behaviour `ensureStore` has.
- [ ] **Step 4: Run; pass.**
- [ ] **Step 5: Commit** `Bulk editor: make a vintage from the bottle row`.

### Task 8: Marking a single barrel or private selection late

**Files:**
- Create: `src/lib/bulk-editor/late-mark.ts`, `src/components/bulk-editor/notices.tsx` (the corner list, the fading Undo notice)
- Modify: `save.ts` (`createBody` routes the liquid fields), `drafts.ts` (draft meta `keepOnLabel`), `rows.ts` (`patchBottleRow` safety net), `bulk-editor.tsx` (notice state, the corner area, the session set of created labels)
- Test: `late-mark.test.ts`, `rows.integration.test.ts`, `e2e/bulk-editor.spec.ts`

**Interfaces:**
- Produces:
  - `LIQUID_FIELDS: ReadonlyArray<ValueField>` = `proof, ageYears, ageMonths, ageDays, ageStatement, tequilaClass, brandyGrade, ginIsNas`.
  - `routeLiquid(cells: Readonly<Record<string, string>>, marked: boolean, keepOnLabel: boolean): { label: Record<string, string>; bottle: Record<string, string> }`: when `marked && !keepOnLabel` the liquid fields go to `bottle`, otherwise to `label`; other fields keep their normal side.
  - `type Notice = { id: string; text: string; undo?: () => void }`; `Notices({ notices, onDismiss })`.
  - `patchBottleRow(ownerId, bottleId, raw)` accepts `moveLiquidFromLabel: true`; it moves only when, inside the same transaction, the bottle's label has exactly one bottle.

- [ ] **Step 1: Write the failing tests:** `late-mark.test.ts`: proof, age and tequila class route to the bottle when marked and to the label when not, and size never moves; marking then un-marking before saving routes them back (no stored state to restore); `keepOnLabel` keeps them on the label although marked. A row marked single barrel or private selection with a vintage name typed creates no vintage and stores the name in `bottles.batch` (integration test on `createRow`). Integration: `moveLiquidFromLabel` moves the label's proof and age to the bottle and clears the label's when the label has one bottle, and does nothing when it has two (Review Focus 7). e2e: type brand, label, category, proof, age, then tick Private selection: the notice names "Barrell Craft Spirits · Cask Select", the proof cell wears PS, and after saving the label's proof is blank and the bottle's is set; **Undo** puts both on the label and leaves the bottle flagged; a row saved with Enter first and then marked, in the same session, shows the safety-net notice and moves them; the same after a reload moves nothing; the notice fades by itself after about ten seconds and not while the pointer is on it; two notices show newest on top.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.** For an unsaved row the routing happens when the row is created (`createBody` uses `routeLiquid`), so un-marking needs no restore logic. The Undo on the safety-net notice re-patches the label with the old values and the bottle with blanks. The session set of created labels is in-memory state in `bulk-editor.tsx`; the client sends `moveLiquidFromLabel` only for labels in it and the server's one-bottle count is the final check. The notice area is the existing fixed bottom-right `aria-live` region.
- [ ] **Step 4: Run; pass.**
- [ ] **Step 5: Commit** `Bulk editor: move proof and age to the bottle when a selection is marked late`.

### Task 9: Tequila class, brandy grade and gin NAS

**Files:**
- Modify: `fields.ts` (one column each instead of a label and a bottle one), `editors.ts`, `sheet.ts`
- Test: `fields.test.ts`, `resolve.test.ts`

**Interfaces:**
- Consumes: `resolve`, `scopesFor(row, field)` (bottle, label only).

- [ ] **Step 1: Write the failing tests:** a bottle with its own brandy grade shows it with a `B` marker, without shows the label's with none; `scopesFor(row, "tequilaClass")` has no vintage; rotating a tequila bottle's class cell offers the bottle and the label only.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement** the merge, keeping each field's existing applicability rules (a column only edits where the form would show the field).
- [ ] **Step 4: Run; pass.**
- [ ] **Step 5: Commit** `Bulk editor: one tequila class, brandy grade and gin NAS cell each`.

### Task 10: Verify

**Files:**
- Modify: `docs/superpowers/specs/2026-11-16-bulk-editor-one-value-design.md` (status line), `e2e/bulk-editor.spec.ts`

- [ ] **Step 1:** On a scratch database, run `npx tsc --noEmit`, `npx eslint .`, the whole `npx vitest run` with `TOURNAMENT_TEST_DATABASE_URL`, and the whole Playwright suite against a production build (`next build`, `next start -p 1965`). Pre-existing failures (photo uploads under `/data`, single-barrel on `/bottles/new`, mashbill sort order, the tournaments spec's category name, `lines pasted at the empty row`) are named in the PR, not fixed here.
- [ ] **Step 2:** Walk the Pinhook, Elijah Craig, Alberta Premium (vintages differing in proof only), Russell's, Barrell and plain-label cases by keyboard alone and take light and dark screenshots of the marker at rest, the note while editing, the vintage Create option, and the Undo notice.
- [ ] **Step 3:** Run axe in both themes on the sheet with a note open.
- [ ] **Step 4: Commit** `Bulk editor: verify the one-value design`, with the counts and screenshots in the PR description.
