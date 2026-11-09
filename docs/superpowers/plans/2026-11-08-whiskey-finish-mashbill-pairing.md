# Whiskey Finish and Mashbill Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the label form's Finishes field, say which mashbill each finish went on and what share of the blend each combination is, including an unfinished remainder.

**Architecture:** A new table `expression_finish_mashbills` stores one row per (mashbill, finish-or-unfinished) pair with an optional whole-percent share. A pure module resolves and validates pairs and computes the roll-ups; `replaceLinks` writes pairs after the mashbill and finish links in the same transaction and rewrites the stored `share_pct` copies. The finish link rows in the existing `finishLinks` JSON carry their pairs, so every caller that already sends links (form, grid, phone) keeps working.

**Tech Stack:** Next.js App Router, React, Drizzle ORM on Postgres (hand-written migrations), zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-whiskey-finish-mashbill-pairing-design.md`

## Global Constraints

- Shares are whole percentages, 0 to 100 (`Math.round`, as `insertLinks` does today). A share box appears on a field only when it has two or more entries.
- When any share is entered, all pair shares on the label sum to exactly 100. All shares blank is always valid.
- Finish months are the finishing duration only, optional, per finish. Total age is never stored here.
- Mashbill and finish shares are computed from pairs when every pair has a share; the form never writes them directly in that case.
- The UI word is "Mashbill" (never "Applied to"). A finish on one mashbill shows one dropdown and one share box; on several, one line per mashbill plus "+ Add mashbill".
- The unfinished remainder is a pair with `finish_id` NULL, at most once per mashbill.
- Migrations are hand-written: SQL file, `drizzle/meta/_journal.json` entry, then `npm run db:migrate`. The next number is 0053.
- Web and server only. iOS is a separate follow-up, but a PATCH from the phone that omits pairs must not erase them.
- Pairing applies to every category that shows finishes (`showsFinishes(context)`), not only bourbon.

## Review Focus

- Removing a mashbill (or finish) from the label removes its pairs, and the remaining totals stop claiming 100%: no dangling pair, no stale roll-up (Task 3).
- A phone or grid save that sends finish rows without `mashbills`/`share` leaves existing pairs intact (Task 3).
- Shares of 99 or 101 are rejected with the difference named; a single typed share with no others is also rejected (Task 2).
- The same finish twice on one mashbill, or two unfinished rows on one mashbill, is rejected rather than hitting the unique index (Task 2).
- Switching a label to a category that hides the finish picker keeps its saved pairs, as hidden finish links are kept today (Task 5).

## File Structure

- Create `drizzle/0053_finish_mashbill_pairs.sql`; modify `drizzle/meta/_journal.json`, `src/db/schema.ts`.
- Create `src/lib/expressions/finish-pairs.ts`: pure types, `resolveFinishPairs`, validation. One responsibility, no DB.
- Modify `src/lib/expressions/schema.ts` (`linkRowSchema`/`parseLinks`) and `src/lib/expressions/save.ts` (`insertLinks`, `replaceLinks`).
- Modify `src/lib/expressions/queries.ts`: load pairs with the finish rows. Modify `src/app/api/v1/expressions/[id]/route.ts`: expose them.
- Create `src/components/expressions/finish-picker.tsx`; modify `src/components/expressions/expression-form.tsx` and `ordered-picker.tsx` (`LinkedRow` gains optional pair fields).
- Tests: `src/lib/expressions/__tests__/finish-pairs.test.ts`, `finish-pairs-save.test.ts` (DB-backed, opt-in like the other integration suites), `e2e/finish-pairs.spec.ts`.

---

### Task 1: Migration and schema

**Files:**
- Create: `drizzle/0053_finish_mashbill_pairs.sql`
- Modify: `drizzle/meta/_journal.json` (idx 53, tag `0053_finish_mashbill_pairs`, `when` greater than 0052's), `src/db/schema.ts`
- Test: `src/lib/expressions/__tests__/merge-fks.test.ts` (must still pass unchanged)

**Interfaces:**
- Produces: Drizzle table `expressionFinishMashbills` with columns `id`, `expressionId`, `mashbillId`, `finishId` (nullable), `sharePct` (nullable `pct`), `position`; and column `expressionFinishes.sharePct` (nullable `pct`).

- [ ] **Step 1: Write the migration.** `ALTER TABLE expression_finishes ADD COLUMN share_pct numeric(5,2)`. Create `expression_finish_mashbills` with a serial `id` primary key, `expression_id`, `mashbill_id`, nullable `finish_id`, nullable `share_pct numeric(5,2)` with a 0..100 check, `position integer NOT NULL DEFAULT 0`. Foreign keys are composite and `ON DELETE CASCADE`: `(expression_id, mashbill_id)` references `expression_mashbills`, and `(expression_id, finish_id)` references `expression_finishes` (a NULL `finish_id` skips that key). Add `CREATE UNIQUE INDEX ... ON (expression_id, mashbill_id, COALESCE(finish_id, 0))` so each pair, and each unfinished portion, exists once. Do not add a direct `REFERENCES expressions(`: the composite keys already cascade, and a direct one would break `merge-fks.test.ts`.
- [ ] **Step 2: Add the journal entry and mirror the table and column in `src/db/schema.ts`** (follow `expressionFinishes` for style; the unique index uses `sql\`coalesce(...)\``).
- [ ] **Step 3: Apply and check.** Run `npm run db:migrate` against a scratch database, then `\d expression_finish_mashbills`. Expected: both foreign keys listed with `ON DELETE CASCADE`.
- [ ] **Step 4: Run** `npx vitest run src/lib/expressions/__tests__/merge-fks.test.ts` and `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** `feat: table for which finish went on which mashbill`.

### Task 2: Pair resolution and validation (pure)

**Files:**
- Create: `src/lib/expressions/finish-pairs.ts`
- Test: `src/lib/expressions/__tests__/finish-pairs.test.ts`

**Interfaces:**
- Produces:
  - `type FinishRowInput = { finishId: number | null; share: number | null; mashbills?: { mashbillId: number; share: number | null }[] }` (`finishId: null` is the unfinished row).
  - `type Pair = { mashbillId: number; finishId: number | null; share: number | null; position: number }`
  - `type Resolved = { pairs: Pair[]; mashbillShares: Map<number, number>; finishShares: Map<number, number>; errors: string[] }`
  - `resolveFinishPairs(labelMashbillIds: number[], rows: FinishRowInput[]): Resolved`
  - `const FINISH_PAIR_TOTAL_MESSAGE = (diff: number) => string`: "Shares add up to N%: M over/under."

- [ ] **Step 1: Write failing tests** using the Blue Note table from the spec as the fixture (mashbill ids 1 = 84/8/8, 2 = 70/22/8, 3 = 70/21/9; finishes Cognac, Madeira, Sherry, Port, Vino de Naranja, Vanilla Cognac, Apricot Brandy, Winter Bock). Test names and assertions:
  - `resolves Blue Note`: nine pairs, `mashbillShares` = {1: 6, 2: 3, 3: 91}, Cognac finish share 15, Vino de Naranja 41, no errors.
  - `a finish with no mashbills on a one-mashbill label pairs with that mashbill`.
  - `with several mashbills a finish with none listed defaults to the first`.
  - `shares of 99 and 101 are rejected naming the difference` and `one typed share with the rest blank is rejected`.
  - `all shares blank is valid and rolls nothing up` (maps empty).
  - `an unfinished row pairs with finishId null and counts toward the mashbill total` (e.g. one mashbill, Sherry 30, Cognac 10, unfinished 60 → mashbill 100).
  - `the same finish twice on one mashbill is rejected`, `two unfinished rows on one mashbill is rejected`, `a pair naming a mashbill not on the label is rejected`.
- [ ] **Step 2: Run** `npx vitest run src/lib/expressions/__tests__/finish-pairs.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `resolveFinishPairs` in `finish-pairs.ts`.** Roll-ups are computed only when every pair has a share. `position` follows row order, then line order.
- [ ] **Step 4: Re-run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: resolve and validate finish and mashbill pairs`.

### Task 3: Save path, parsing, and survival

**Files:**
- Modify: `src/lib/expressions/schema.ts` (`linkRowSchema`, `parseLinks`), `src/lib/expressions/save.ts` (`insertLinks`, `replaceLinks`)
- Test: `src/lib/expressions/__tests__/finish-pairs-save.test.ts` (DB-backed; copy the setup and opt-in switch from `save-bond.test.ts`)

**Interfaces:**
- Consumes: `resolveFinishPairs`, `FinishRowInput` from Task 2; `expressionFinishMashbills` from Task 1.
- Produces: the finish row JSON may carry `share?: number | null`, `mashbills?: { id: number; share: number | null }[]`, and `unfinished?: true` (the unfinished row uses `id: 0`). `LinkRow` in `schema.ts` gains those optional fields. `insertLinks` and `replaceLinks` keep their signatures.

- [ ] **Step 1: Write failing tests.** Save the Blue Note label, reload, expect nine pairs with the exact shares and `expression_mashbills.share_pct` = 6, 3, 91. Then: `removing a mashbill from the label deletes its pairs and nulls the finish shares it fed` (Review Focus 1); `a save whose finish rows omit mashbills and share keeps the existing pairs` (Review Focus 2); `an invalid total throws a validation error and writes nothing`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Extend `linkRowSchema`/`parseLinks`** to accept the three optional fields (shares rounded to whole numbers, `mashbills` capped at the number of mashbills, finish id 0 allowed only with `unfinished: true`; a row that fails keeps today's behaviour of being dropped).
- [ ] **Step 4: In `replaceLinks`, before the deletes, read the label's existing pairs; after `insertLinks`, re-insert any pair whose finish row sent neither `mashbills` nor `share` and whose mashbill and finish are both still linked.** In `insertLinks`, after the three link inserts, call `resolveFinishPairs`, insert the pairs, then update `expression_mashbills.share_pct` and `expression_finishes.share_pct` from the roll-ups when present. Validation errors are thrown the way `save.ts` reports other field errors today.
- [ ] **Step 5: Run** the new suite plus `npx vitest run src/lib/expressions`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: save finish and mashbill pairs with the label`.

### Task 4: Read path and API

**Files:**
- Modify: `src/lib/expressions/queries.ts` (the finish loaders near lines 112 and 373), `src/app/api/v1/expressions/[id]/route.ts` (finishes mapping near line 107), `src/components/expressions/ordered-picker.tsx` (`LinkedRow`)
- Test: `src/app/api/v1/expressions/[id]/__tests__/` (extend the existing GET test) and `src/lib/expressions/__tests__/finish-pairs-save.test.ts`

**Interfaces:**
- Consumes: `expressionFinishMashbills`, `expression_finishes.share_pct`.
- Produces: `LinkedRow` gains `share?: string`, `mashbills?: { id: number; label: string; share: string }[]`, `unfinished?: boolean`. The expression GET returns each finish as `{ id, name, amount, share, mashbills: [{ id, name, share }] }` and a top-level `unfinished: [{ mashbillId, share }]`. Existing keys keep their shape.

- [ ] **Step 1: Write the failing test:** GET the saved Blue Note label; Cognac has two mashbill lines (3 and 12), `unfinished` is empty, and a one-mashbill label returns `mashbills` with one entry.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Load pairs in `queries.ts` and attach them to finish rows** (group by `finish_id`; the NULL ones become the unfinished list). One extra query per label, not one per finish.
- [ ] **Step 4: Map them in the API route; run** `npx vitest run src/app/api src/lib/expressions` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: return finish and mashbill pairs from the label API`.

### Task 5: The Finishes field

**Files:**
- Create: `src/components/expressions/finish-picker.tsx`
- Modify: `src/components/expressions/expression-form.tsx` (the `showsFinishes(context)` branch around lines 510 to 531, and the Mashbills block above it)
- Test: `e2e/finish-pairs.spec.ts`

**Interfaces:**
- Consumes: `LinkedRow` from Task 4; `serializeLinks`/`linksPayload` (extend `linksPayload` in `src/lib/expressions/links.ts` to emit `share`, `mashbills`, `unfinished`).
- Produces: `FinishPicker({ finishes, mashbills, onChange }: { finishes: LinkedRow[]; mashbills: LinkedRow[]; onChange: (rows: LinkedRow[]) => void })`, rendering the `finishLinks` hidden input.

- [ ] **Step 1: Write the failing Playwright spec** `builds the Blue Note label`: open a new bourbon label, add three mashbills, add the eight finishes choosing each one's mashbill, put Cognac on two with 3 and 12, fill the shares, see the Mashbills field show 6, 3 and 91 read-only and the total read "100%", save, reload, and see all of it again.
- [ ] **Step 2: Run** `npx playwright test e2e/finish-pairs.spec.ts --trace off`. Expected: FAIL.
- [ ] **Step 3: Implement `FinishPicker`** per the spec's "What the owner sees": reuse the existing finish combobox and months box from `OrderedPicker` rather than rebuilding them; Mashbill dropdown only when the label has two or more mashbills; Share only when there are two or more finishes (or an unfinished row); per-mashbill lines when a finish has more than one; "+ Add unfinished portion"; running total with the difference named when it is not 100. Keep the existing `OrderedPicker` path for categories that hide months or order (`Cask Types`) but still pass the pair fields through. Mashbill shares render read-only with "from finishes" when roll-ups exist.
- [ ] **Step 4: Keep the hidden-picker rule:** the `else` branch that renders a hidden `finishLinks` input must serialise pairs too (Review Focus 5). Add an assertion for it to the spec by saving a label, switching its category to one that hides finishes, saving, and checking the pairs remain via the API GET.
- [ ] **Step 5: Run** the spec, then `npm run typecheck`, `npm run lint`, `npx vitest run`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: pick the mashbill and share for each finish on the label form`.

### Task 6: Verify against a scratch database and open the PR

**Files:** none changed.

- [ ] **Step 1: Create a throwaway database** (see the saved dev-server and scratch-DB notes; use `localhost`, not `127.0.0.1`), migrate, and run the opt-in suites: `finish-pairs-save.test.ts` and the existing link suites. Record the pass counts.
- [ ] **Step 2: Run the full Playwright suite once** and compare failures with a clean `main` run; four specs already fail there.
- [ ] **Step 3: Push `claude/whiskey-finish-mashbill-pairing`, check `gh pr list --state all --search finish` for overlap, and open the PR** with the spec link, the Blue Note screenshot from the e2e run, the scratch-database counts, and "iOS follow-up" under Not in this PR.

---

## Self-Review

- **Spec coverage:** rules 1 to 5 map to Tasks 2 (rules 3, 4, 5, share sums), 3 (storage, roll-ups, preservation), 5 (UI and share-box visibility). Rule 2 (months only) is unchanged code, asserted in the Blue Note save test with months left null. Validation list from the spec's Save Path is Task 2's test list. Non-goals: nothing here touches age, origin, other spirits' behaviour, or iOS.
- **Type consistency:** `FinishRowInput`, `Pair`, `Resolved`, `LinkedRow.mashbills`, and the wire fields `share`, `mashbills`, `unfinished` are named the same in Tasks 2 to 5.
- **Proportion:** six tasks against a spec of about 100 lines; bodies are left to the implementer except the SQL decisions and the fixture.
- **Known gaps left for the implementer, deliberately:** the exact wording of the "+ Add unfinished portion" row beyond the spec; whether `links-cell.tsx` (grid display) shows shares. It keeps today's months-only text unless the PR review asks.
