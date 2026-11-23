# Housekeeping 3: The Duplicates section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Duplicates section on the Housekeeping page that finds likely duplicate rows of nine reference kinds (brands, distilleries, companies, finishes, ingredients, mashbills, cooperages, stores, tags), lets the owner pick the survivor and see exactly what moves, merges the pair in one transaction, and remembers "not a duplicate".

**Architecture:** Pure detection and adoption logic in `src/lib/housekeeping/` (no database), a small shared decisions store (dismissals and a merge log, one migration), one candidate query per kind, one merge engine with a per-kind relink table, two server actions, and a server-rendered section with a client pair card. Stacked on PR #380 (the page and its Photos section).

**Tech Stack:** Next 16 App Router, React 19, Drizzle/Postgres, vitest (node; `renderToStaticMarkup` for components), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-tidy-up-page-design.md`, sections "Duplicates" and "Merge behaviour, revised against #343"; issue #343; mockup https://claude.ai/artifact/ARwfwRCCRaR9s6Qs1qTPtz (the pair card). This is plan 3 of 7.

## Scope

- **In:** the nine kinds above. **Out, and why:**
  - **Categories:** shared by every account (spec).
  - **Labels:** merging labels needs a facts picker (`KEEPABLE_FACTS` in `src/lib/expressions/merge.ts`) and the web has no UI for it today (only the iOS API route). That is plan 3b, which reuses `mergeLabels` and the engine's dismissal and log tables from this plan.
- The decisions store built here (`housekeeping_dismissals`) is generic on purpose: plans 4 to 6 reuse it for "Not on TTB" and "Leave blank / Not known".

## Global Constraints

- Everything is per account: every query filters `ownerId`; a merge refuses ids that are not the caller's as "gone" and changes nothing.
- A merge is **one transaction**, locks both rows in id order, is **not undoable**, and records a row in `housekeeping_merges` (kind, survivor id and name, removed id and name, what moved, which fields were adopted, when).
- The removed row's **name is kept as an "other name"** on the survivor where the kind has an other-names store (`distillery_names` for distilleries). The other kinds have none.
- **Fields only the removed row has are offered to the survivor, default on, never silently dropped.** Where both have a value the survivor's wins and the removed one is not kept.
- "Not a duplicate" is remembered per account per pair (`housekeeping_dismissals`, scope `duplicate:<kind>`, key `<lowerId>:<higherId>`) and is removed if either row is merged away.
- Matching **reuses `src/lib/bulk-editor/suggest.ts`** (`normalise`, `distance`, and its slips-allowed rule, which this plan exports) so this page and the autocompletes agree. Names are compared **as whole names**, never as typed prefixes, because "Old Forester" is a prefix of "Old Forester 100" and the autocomplete's prefix rule would flag every label family.
- Score: `0` same name apart from case, accents, spacing or punctuation; `1` same once filler words are dropped; `2` a few letters apart (the slips-allowed rule, or a plural). Names of three letters or fewer match only at score `0`.
- **Stores** are a duplicate only when places agree or one side has none (the unique key is name plus place). **Ingredients** pair only within the same `kind`. **Mashbills** pair only on an identical grain recipe (`recipeKey` in `src/lib/mashbills.ts`), never by name.
- A merge must be **blocked with a plain message, not a database error**, when it cannot succeed: two brands that each have a label of the same name (`unique(brand_id, name)` on `expressions`), two mashbills whose recipes differ, a pair that is not both the caller's.
- Migrations are hand-written: `drizzle/0054_*.sql`, an entry in `drizzle/meta/_journal.json`, `schema.sql`, `src/db/schema.ts`; `src/lib/__tests__/migrations-journal.test.ts` must pass.
- Square corners, `Section`/`Button` components, the app's look (as the Photos section). CI does not run DB-backed suites or Playwright; show counts in the PR.
- **Codex has no access to localhost Postgres.** Tasks 2 and 3 are pure and are the ones to delegate; everything that touches the database or a browser stays with the executor.

## Review Focus

- **Brand merge with a same-name label under both brands** must be refused with a message, not a raw unique-violation.
- **Finish and mashbill merges touch `expression_finish_mashbills`,** which has composite foreign keys into `expression_finishes` and `expression_mashbills`. A label that already has the survivor, or a pair that would collide on `expression_finish_mashbills_pair_unique`, must end with no orphaned and no duplicated rows.
- **Ids from another account, or forged ids,** passed to the actions must change nothing and say the pair is gone. Adopted field names outside the offered list must be ignored.
- **Merging the same pair twice** (double click, two tabs) must give a friendly "already merged" message, not a 500; and merging A into B when B is also in a pair with C must leave B's pair with C listed.
- **A dismissed pair stays gone in either id order,** and dismissals that mention a merged-away row are removed.

---

### Task 1: The decisions tables

**Files:**
- Create: `drizzle/0054_housekeeping_decisions.sql`
- Modify: `drizzle/meta/_journal.json`, `schema.sql`, `src/db/schema.ts`

**Interfaces:**
- Produces in `src/db/schema.ts`: `housekeepingDismissals` (`id`, `ownerId` → users on delete cascade, `scope` text, `key` text, `createdAt`; unique `(ownerId, scope, key)`; index `(ownerId, scope)`) and `housekeepingMerges` (`id`, `ownerId` → users on delete cascade, `kind` text, `survivorId` int, `survivorName` text, `removedId` int, `removedName` text, `moved` jsonb default `[]` typed `Array<{ label: string; count: number }>`, `adopted` jsonb default `[]` typed `string[]`, `createdAt`).

- [ ] **Step 1: Set up.** Worktree `.claude/worktrees/housekeeping-duplicates` (branch `claude/housekeeping-duplicates`, stacked on `claude/housekeeping-photos`) exists; run `npm ci` in it. Commit this plan file as the first commit.
- [ ] **Step 2: Write the failing test.** Extend nothing: the existing `migrations-journal.test.ts` is the gate. Add the `.sql` file first (copy the shape of `0053`), run `npx vitest run src/lib/__tests__/migrations-journal.test.ts`, and expect FAIL (file not in the journal).
- [ ] **Step 3: Implement.** Write the SQL for both tables (names `housekeeping_dismissals`, `housekeeping_merges`), add the journal entry (`idx` 54, `when` = previous + 86400000, `tag` `0054_housekeeping_decisions`), add both tables to `schema.sql` and `src/db/schema.ts`.
- [ ] **Step 4: Verify.** `npx vitest run src/lib/__tests__/migrations-journal.test.ts` passes; against a throwaway database (see memory `bulk-editor-verification-recipe.md`) `npx tsx scripts/migrate.ts` applies cleanly and `scripts/reset.ts` still empties every table (add the two new tables to its list if it enumerates them).
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the Housekeeping decisions tables"`.

---

### Task 2: Pair detection (pure; delegate to Codex)

**Files:**
- Create: `src/lib/housekeeping/duplicate-kinds.ts`, `src/lib/housekeeping/pair-detection.ts`
- Modify: `src/lib/bulk-editor/suggest.ts` (export `slipsAllowed` only; no behaviour change)
- Test: `src/lib/housekeeping/__tests__/pair-detection.test.ts`

**Interfaces:**
- Produces in `duplicate-kinds.ts`: `export const DUPLICATE_KINDS = ["brands","distilleries","companies","finishes","ingredients","mashbills","cooperages","stores","tags"] as const; export type DuplicateKind = (typeof DUPLICATE_KINDS)[number]; export const KIND_LABELS: Record<DuplicateKind, string>` (`Brands`, `Distilleries`, `Companies`, `Finishes`, `Ingredients`, `Mashbills`, `Cooperages`, `Stores`, `Tags`).
- Produces in `pair-detection.ts`:
  - `export type NameRow = { id: number; name: string; group?: string | null; place?: string | null }` (`group` is an ingredient's kind; `place` a store's normalised place, or null when unknown)
  - `export type Pair = { aId: number; bId: number; score: 0 | 1 | 2; reason: string }` (`aId < bId`)
  - `export const FILLER_WORDS: Record<DuplicateKind, readonly string[]>`
  - `export function findNamePairs(kind: Exclude<DuplicateKind, "mashbills">, rows: NameRow[]): Pair[]` (best score first, then by name, then ids)
  - `export function findMashbillPairs(rows: { id: number; key: string }[]): Pair[]` (every pair sharing a key; score 0, reason `Same grain recipe`)

- [ ] **Step 1: Write the failing tests** with the spec's own examples, as data: `("Buffalo Trace", "Buffalo Trace Distillery")` as distilleries is score 1 with reason `Same name once “Distillery” is dropped`; `("Maker’s Mark", "Makers Mark")` and `("Heaven Hill", "Heavenhill")` are score 0 with reason `Same name apart from spacing and punctuation`; `("Madeira Cask", "Maderia Cask")` as finishes is score 2 `One letter apart` (a swapped pair counts as one); `("Port Cask", "Port Casks")` is score 2 `Same name apart from the plural`; `("Cognac Cask", "Cognac Cask Finish")` as finishes is score 1 dropping `Finish`. Not pairs: `("Old Forester", "Old Forester 100")`, `("Wild Turkey", "Wild Turkey Rare Breed")`, `("Rye", "Rum")` (three letters or fewer). Stores: the same name in two different places is not a pair; the same name where one place is null is; `Binny’s`/`Binnys` in the same place is. Ingredients: identical names in different `group`s are not a pair. Output is symmetric (`aId < bId`, each pair once) and ordered best score first. Mashbills: three rows sharing a key give three pairs; different keys give none. A 2,000-name synthetic set returns in under one second.
- [ ] **Step 2: Run to see them fail.** `npx vitest run src/lib/housekeeping/__tests__/pair-detection.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Compare squished names first (score 0), then with the kind's filler words removed (score 1, naming the dropped word in the reason), then whole-name `distance` within `slipsAllowed` (score 2; `Same name apart from the plural` when one is the other plus a trailing `s`, else `One letter apart` / `N letters apart`). Skip the distance when the squished lengths differ by more than the allowed slips. Filler words are a small data table per kind (for example distilleries: `distillery`, `distilling`, `distillers`, `co`, `company`, `inc`, `llc`, `ltd`, `the`; finishes: `finish`, `finished`; companies and brands: `the`, `co`, `company`, `inc`, `llc`, `ltd`, `corp`).
- [ ] **Step 4: Run to see them pass**, then `npx vitest run src/lib/bulk-editor` to confirm the autocomplete's tests are unchanged.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add Housekeeping pair detection"`.

---

### Task 3: Adoption planning (pure; delegate to Codex)

**Files:**
- Create: `src/lib/housekeeping/adoption.ts`
- Test: `src/lib/housekeeping/__tests__/adoption.test.ts`

**Interfaces:**
- Consumes: `DuplicateKind` (Task 2).
- Produces: `export type Adoptable = { field: string; label: string; value: unknown }`; `export const ADOPTABLE: Record<DuplicateKind, readonly { field: string; label: string }[]>` (the optional columns worth carrying: distilleries `city`, `state`, `region`, `dspNumber`, `nomNumber`, `founded`, `companyId`, `notes`; stores `city`, `state`, `country`, `url`, `notes`; brands `companyId`, `notes`; companies `city`, `state`, `country`, `notes`; finishes `finishType`, `notes`; cooperages `notes`; ingredients `family`; mashbills `style`; tags `color`; read `src/db/schema.ts` for the exact camelCase property names); `export function planAdoption(kind: DuplicateKind, survivor: Record<string, unknown>, removed: Record<string, unknown>): Adoptable[]`; `export function allowedAdoptions(kind: DuplicateKind, requested: readonly string[]): string[]` (drops anything not in `ADOPTABLE[kind]`).

- [ ] **Step 1: Write the failing tests.** A distillery survivor with no `city` and a removed one with `Bardstown` offers `city`; a survivor that already has a `city` offers nothing for it (the survivor wins); empty strings count as empty; a finish adopts `finishType` only when the survivor's is `other` and the removed one's is not; fields not in `ADOPTABLE` (for example `ownerId`, `id`, `slug`) are never offered; `allowedAdoptions("distilleries", ["city", "ownerId", "bogus"])` is `["city"]`.
- [ ] **Step 2: Run to see them fail**, **Step 3: implement**, **Step 4: run to see them pass** (`npx vitest run src/lib/housekeeping/__tests__/adoption.test.ts`).
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add Housekeeping adoption planning"`.

---

### Task 4: Dismissals

**Files:**
- Create: `src/lib/housekeeping/dismissals.ts`
- Test: `src/lib/housekeeping/__tests__/dismissals.test.ts` (pure key tests) and `.../dismissals.integration.test.ts` (skipped without a database, as `src/lib/tournaments/__tests__/lifecycle.integration.test.ts`)

**Interfaces:**
- Produces: `export const duplicateScope = (kind: DuplicateKind) => `duplicate:${kind}``; `export function pairKey(aId: number, bId: number): string` (`<lower>:<higher>`); `export async function dismiss(ownerId: number, scope: string, key: string): Promise<void>` (idempotent); `export async function listDismissed(ownerId: number, scope: string): Promise<Set<string>>`; `export async function clearDismissalsFor(tx: Tx, ownerId: number, kind: DuplicateKind, id: number): Promise<void>` (removes every `duplicate:<kind>` key that mentions the id).

- [ ] **Step 1: Write the failing tests.** `pairKey(9, 3)` equals `pairKey(3, 9)` equals `"3:9"`. Integration (scratch DB, owner A and B): `dismiss` twice stores one row; `listDismissed` is owner-scoped; `clearDismissalsFor(..., "brands", 3)` removes `"3:9"` and `"1:3"` but not `"1:9"` and not another kind's.
- [ ] **Step 2 to 4:** run to see it fail, implement (`import "server-only"` in the DB file; keep `pairKey` importable without it by exporting the pure helpers from `pair-key.ts` if `server-only` blocks the pure test), run to see it pass.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add Housekeeping dismissals"`.

---

### Task 5: Candidate queries

**Files:**
- Create: `src/lib/housekeeping/duplicate-queries.ts`
- Test: `src/lib/housekeeping/__tests__/duplicate-queries.integration.test.ts` (scratch DB)

**Interfaces:**
- Consumes: `findNamePairs`, `findMashbillPairs` (Task 2), `listDismissed`, `pairKey`, `duplicateScope` (Task 4).
- Produces: `export type SideView = { id: number; name: string; detail: string; uses: number; fields: Record<string, unknown> }` (`detail` is a short line such as a place; `uses` the number of labels or bottles that point at it; `fields` the optional columns of Task 3); `export type PairView = { key: string; kind: DuplicateKind; score: 0 | 1 | 2; reason: string; a: SideView; b: SideView }`; `export async function countDuplicatePairs(ownerId: number): Promise<Record<DuplicateKind, number>>`; `export async function listDuplicatePairs(ownerId: number, kind: DuplicateKind, limit: number): Promise<PairView[]>` (best first, dismissed pairs excluded, at most `limit`).

- [ ] **Step 1: Write the failing integration test.** Seed for owner A: two distilleries `Buffalo Trace` and `Buffalo Trace Distillery` with labels on each; two brands differing by an apostrophe; two stores with the same name in different cities and two with the same name and city; two mashbills with the same grains in a different order and one different; two ingredients with the same name and different kinds. Owner B has an identical near-pair. Assert: the counts per kind for A (the different-city stores and different-kind ingredients are not counted), nothing of B's appears for A, a dismissed pair disappears and a different pair stays, `uses` matches the number of labels pointing at each side, and `limit` truncates.
- [ ] **Step 2: Run against the scratch database to see it fail.** Expected: FAIL (module not found); without a database it is skipped.
- [ ] **Step 3: Implement.** One select per kind of `id`, `name` and the kind's extra columns (place for stores, `kind` for ingredients, grains aggregated to a `recipeKey` for mashbills), then detection, then drop dismissed pairs, then hydrate the top `limit` with `uses` (one grouped count per kind, not per pair) and `fields`. `countDuplicatePairs` runs the same without hydration. Budget: 2,000 rows of one kind in under half a second; if a real account is slower, compute the counts per tab on demand.
- [ ] **Step 4: Run against the scratch database to see it pass**; drop the database afterwards.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the Housekeeping duplicate queries"`.

---

### Task 6: The merge engine

**Files:**
- Create: `src/lib/housekeeping/merge-reference.ts`
- Test: `src/lib/housekeeping/__tests__/merge-reference.integration.test.ts` (scratch DB)

**Interfaces:**
- Consumes: `DuplicateKind`, `planAdoption`, `allowedAdoptions`, `clearDismissalsFor`, `housekeepingMerges`.
- Produces: `export class HousekeepingMergeError extends Error { constructor(readonly code: "same" | "gone" | "blocked", message: string) }`; `export type Move = { label: string; count: number }`; `export type MergePreview = { moves: Move[]; adoptable: Adoptable[]; blocked: string | null }`; `export async function previewMerge(ownerId: number, kind: DuplicateKind, survivorId: number, removedId: number): Promise<MergePreview>`; `export type MergeSummary = { survivorName: string; removedName: string; moves: Move[]; adopted: string[] }`; `export async function mergeReference(ownerId: number, kind: DuplicateKind, survivorId: number, removedId: number, adopt: readonly string[]): Promise<MergeSummary>`.

The relink table (verify each against `src/db/schema.ts` and the migrations before writing; counts come from the rows actually moved or collapsed):

| Kind | What points at the removed row | Collision rule |
|---|---|---|
| companies | `brands.company_id`, `distilleries.company_id` | none |
| brands | `expressions.brand_id` | blocked if any label name exists under both brands |
| distilleries | `expression_distilleries`, `expression_mashbills.distillery_id`, its `distillery_names` | label linked to both: keep the survivor's row; add the removed row's name as an other name on the survivor, and move its own other names, skipping names the survivor has |
| finishes | `expression_finishes`, and through its composite key `expression_finish_mashbills.finish_id` | add the survivor's `expression_finishes` row first, re-point `expression_finish_mashbills`, drop rows that would collide on `expression_finish_mashbills_pair_unique`, then delete the removed rows |
| ingredients | `expression_ingredients` | label has both: keep the survivor's |
| mashbills | `expression_mashbills`, and `expression_finish_mashbills.mashbill_id` | blocked unless both recipes have the same `recipeKey`; same ordering rule as finishes |
| cooperages | `expressions.cooperage_id` | none |
| stores | `bottles.store_id` | none |
| tags | `bottle_tags` | bottle has both: keep the survivor's |

- [ ] **Step 1: Write the failing integration tests** (scratch DB; one `describe` per row of the table). Each seeds a pair with real references, runs `mergeReference`, and asserts: every reference now points at the survivor, the removed row is gone, nothing is duplicated, the `housekeeping_merges` row has both names and the counts, the pair's dismissals are gone, and adopting `city` (distillery) fills the survivor's empty city but never overwrites a non-empty one. Plus the Review Focus cases: two brands that both have a label named `X` give `HousekeepingMergeError("blocked", ...)` and change nothing; mashbills with different recipes are blocked; a finish merge where one label has both finishes and an `expression_finish_mashbills` row on each ends with one finish row and no orphan; an id belonging to another owner gives `gone` and changes nothing; the same pair merged twice gives `gone` the second time; `survivorId === removedId` gives `same`; an adopt list with `ownerId` and `bogus` fields adopts nothing; a failure part-way (force one by merging a brand whose removed row has a label colliding after an earlier relink in the same call) rolls everything back.
- [ ] **Step 2: Run against the scratch database to see them fail.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** One `db.transaction`; select both rows `FOR UPDATE` ordered by id with the owner filter; throw `gone`/`same`/`blocked` before changing anything; relink per the table; apply `allowedAdoptions` fields to the survivor; delete the removed row; `clearDismissalsFor`; insert the log row; return the summary. `previewMerge` runs the same checks and counts without writing (reads only) and also returns `planAdoption` for the chosen direction. Keep one small function per kind behind a `Record<DuplicateKind, ...>` so a kind is one entry.
- [ ] **Step 4: Run against the scratch database to see them pass** (all kinds green), then drop the database.
- [ ] **Step 5: Commit** in two or three commits as the work lands (simple kinds; distilleries; finishes and mashbills).

---

### Task 7: The server actions

**Files:**
- Create: `src/app/(app)/housekeeping/duplicate-actions.ts`
- Test: `src/app/(app)/housekeeping/__tests__/duplicate-actions.test.ts` (mock `@/lib/auth` and the engine; no database)

**Interfaces:**
- Consumes: `mergeReference`, `previewMerge`, `HousekeepingMergeError`, `dismiss`, `duplicateScope`, `pairKey`, `DUPLICATE_KINDS`.
- Produces (`"use server"`): `mergePairAction(input: { kind: string; survivorId: number; removedId: number; adopt: string[] }): Promise<ActionResult>` and `dismissPairAction(input: { kind: string; aId: number; bId: number }): Promise<ActionResult>`; `ActionResult` from `@/lib/admin/types`. Both call `requireSession()`, validate `kind` against `DUPLICATE_KINDS` and the ids as positive integers, map `HousekeepingMergeError` to `{ ok: false, error: message }` (`gone` says `That pair has already been merged or removed.`), and `revalidatePath("/housekeeping")` on success. A success message names what moved: `Merged “Buffalo Trace Distillery” into “Buffalo Trace”. 3 labels moved.`

- [ ] **Step 1: Write the failing tests.** An unknown kind, a non-integer id and ids that are equal return `{ ok: false }` without calling the engine; a `HousekeepingMergeError` of each code becomes the matching message; success passes the session's owner id (not anything from the input) to the engine and calls `revalidatePath`; `dismissPairAction` stores under `duplicateScope(kind)` with `pairKey` whichever order the ids arrive in.
- [ ] **Step 2 to 4:** run to see them fail, implement, run to see them pass (`npx vitest run "src/app/(app)/housekeeping"`).
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the Housekeeping merge and dismiss actions"`.

---

### Task 8: The Duplicates section

**Files:**
- Create: `src/components/housekeeping/duplicates-section.tsx` (server), `src/components/housekeeping/duplicate-pair-card.tsx` (client)
- Modify: `src/app/(app)/housekeeping/page.tsx`, `src/lib/housekeeping/photo-params.ts` (or a sibling) so each section's links keep the other section's parameters
- Test: `src/components/housekeeping/__tests__/duplicate-pair-card.test.tsx`

**Interfaces:**
- Consumes: `listDuplicatePairs`, `countDuplicatePairs`, `previewMerge`, `PairView`, `KIND_LABELS`, `mergePairAction`, `dismissPairAction`.
- Produces: the section reads `?dup=<kind>` (default: the first kind with pairs, else `brands`); tabs are links with counts; the first ten pairs of the tab render as cards; an empty tab says `Nothing to merge in <kind>.` and names the next step; the page lede gains `, and N pairs look like duplicates` when N is above zero. `DuplicatePairCard({ pair, previews }: { pair: PairView; previews: { aKeeps: MergePreview; bKeeps: MergePreview } })`.

- [ ] **Step 1: Write the failing component tests** (`renderToStaticMarkup`, mocking the actions): the card shows the reason, both names with their `uses` and `detail`, two radios named `Keep this one` with the busier side checked by default, the move line for that direction (`Merging moves 3 labels to Buffalo Trace, and keeps “Buffalo Trace Distillery” as another name.` for distilleries; no other-name clause for other kinds), the offered fields as checked checkboxes, and `Merge` and `Not a duplicate` buttons; a blocked preview shows its message and no enabled Merge button; the card root has an accessible name.
- [ ] **Step 2: Run to see them fail**, **Step 3: implement.** The page computes `previewMerge` for both directions of each shown pair (so the client switches without a round trip). The card's `Merge` asks once (`This can't be undone. Merge?` with `Merge` and `Cancel`) before calling the action; success replaces the card with the action's message (and the page refreshes the list on the next navigation or after a short `router.refresh()`); an error shows in the destructive line and leaves the card; both buttons are disabled while a request runs. Tabs and the Photos section's tabs and pager must not reset each other (build links from the current search parameters).
- [ ] **Step 4: Run to see them pass**; typecheck; eslint.
- [ ] **Step 5: Look at it.** Follow the dev-server recipe (memory `dev-server-use-localhost.md`, `bulk-editor-verification-recipe.md`): throwaway database, `next dev -p 1966` on `localhost`, seed pairs (use `e2e/support`-style SQL), read desktop and 390 px screenshots; check the Photos section still pages correctly alongside it. Record anything that could not be checked.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add the Housekeeping Duplicates section"`.

---

### Task 9: The end-to-end spec

**Files:**
- Create: `e2e/housekeeping-duplicates.spec.ts`, `e2e/support/housekeeping-duplicates.ts` (seed helpers)

- [ ] **Step 1: Write the spec** (read `e2e/housekeeping-photos.spec.ts` and `e2e/support/housekeeping-field.ts` first and follow their pattern, including `assertThrowawayDatabase`). Cases: (a) the Distilleries tab shows the seeded pair with its reason and counts; (b) choosing the other side as survivor changes the move line; (c) Merge asks to confirm, Cancel leaves it, then Merge removes the pair, the labels now show the survivor (open a label's page), the removed distillery is gone from Configuration, and the survivor lists the removed name as an other name; (d) adopting a city fills it in on the survivor; (e) Not a duplicate removes the pair and it is still gone after a reload; (f) two brands with a same-name label show a blocked message and no usable Merge; (g) a finish pair with composite-key pairings merges and the label's finish page still renders; (h) a tab change here does not reset the Photos tab and vice versa; (i) a second merge of the same pair in another tab says it was already merged. Read the `housekeeping_merges` table in one case to confirm the log row.
- [ ] **Step 2: Run it against the dev server and a throwaway database.** `npx playwright test e2e/housekeeping-duplicates.spec.ts --trace off`. Expected: PASS once Tasks 1 to 8 are in; any failure is a finding.
- [ ] **Step 3: Run the existing specs that touch merged kinds** (`e2e/admin.spec.ts`, `e2e/entities.spec.ts`, `e2e/housekeeping-photos.spec.ts`) and report failures by name, noting whether they also fail on `main`.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add the Housekeeping duplicates end-to-end spec"`. In the PR show test counts: CI does not run Playwright or the database-backed suites.
