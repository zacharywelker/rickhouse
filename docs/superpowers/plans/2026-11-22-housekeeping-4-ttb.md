# Housekeeping 4: The TTB approvals section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third Housekeeping section listing the owner's labels that have no TTB approval attached, where each row can search TTB (the same dialog as the label page), take a pasted TTB ID or registry link, or be marked "Not on TTB" so it stops being listed.

**Architecture:** No new TTB logic. Each row reuses `ColaSearchDialog` and `AddById` from the label page and the existing attach actions. New code is one query pair, one small dismissal action (storing under the generic `housekeeping_dismissals` table from PR #387), a row and section component, and a page-state refactor so three sections can each keep their own tab and place in the address.

**Tech Stack:** Next 16 App Router, React 19, Drizzle/Postgres, vitest (node, `renderToStaticMarkup`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-tidy-up-page-design.md`, section "TTB approvals" (and "Open the TTB page and the printable version", already shipped as PR #377); mockup https://claude.ai/artifact/ARwfwRCCRaR9s6Qs1qTPtz. This is plan 4 of 7. **Stacked on PR #387** (the decisions tables and the Duplicates section); retarget to `main` once it merges.

## Global Constraints

- The section is named **TTB approvals**, third on the page after Duplicates, heading `h2`, `aria-labelledby`. The page lede gains `, and N labels have no TTB approval` when N is above zero.
- **The queue:** the owner's labels (`expressions`) with **no row in `expression_colas`** and not dismissed (`housekeeping_dismissals`, scope `ttb`, key the label id as text). A label whose approval was added but whose lookup failed still has a row, so it is not listed. Ordered by brand name, label name, id.
- **Paging:** its own offset (`to`) and page size (`tp`, choices `8, 12, 24, 48`, default 8), Previous and Next, and a range line `1–8 of 14`. Unlike photos, a save here refreshes the page (the existing dialog and `AddById` call `router.refresh()`), so a finished row leaves the list at once and the window refills: **Next is simply one page on, with no saved-count correction.** Finished rows are reported in the notice list above the rows.
- **Row actions:**
  - `Find on TTB` is the existing `ColaSearchDialog` in its existing-label mode (`{ expressionId, onDone }`, `brandName` from the label's brand, `triggerLabel` `Find on TTB`); it already shows the TTB page link and the printable-version icon.
  - A paste field is the existing `AddById` (`label="TTB ID"`); it accepts a 14-digit ID or a registry link and fetches it when lookups are on.
  - `Not on TTB` records the dismissal. There is no undo in this section; the label and its own page are unchanged, and an approval can still be added there.
- **Lookup switched off** (`colaLookupEnabled()` false, env `COLA_LOOKUP=false`): no `Find on TTB`; the section says `Searching TTB is off on this server. Paste a TTB ID or link instead.` and `AddById` still works (it stores the ID without fetching).
- Attaching reuses `attachColasAction` / `addColaAction`; this plan writes no attach code and no TTB fetching.
- Everything is per account: the queries filter `ownerId`; `dismissTtbAction` verifies the label belongs to the signed-in account (else "gone") and takes the account only from the session.
- **Three sections, three places in the address.** Changing a tab, page size or page in one section keeps the other two exactly as they are: `tab`/`per`/`offset` (Photos), `dup` (Duplicates), `to`/`tp` (TTB). Bad values fall back to defaults; an offset past the end clamps to the last full window.
- Square corners, `Section` and `Button`, the app's look, matching the Photos and Duplicates sections. CI does not run DB-backed suites or Playwright; show counts in the PR.
- **Codex has no access to localhost Postgres or a browser.** Only the pure page-state module (Task 1, step A) is a fit to delegate.

## Review Focus

- **A forged or another account's label id** to `dismissTtbAction` must change nothing and say the label is gone.
- **Dismissals are per account and stick:** a label dismissed by one account is still listed for another; a dismissed label stays gone after reload; a label that gains an approval leaves the list without a dismissal.
- **Bad `to` / `tp` values** (`to=999`, `to=-1`, `to=abc`, `tp=7`) must fall back or clamp, never error or show an empty page.
- **Lookup off** must not offer search, and an ID added by paste must still attach and leave the list.
- **Changing one section's tab or page size must not reset the other two** (all three directions).
- **Double clicks and a stale row:** a row's actions are disabled while one runs; `Not on TTB` on a row whose label was deleted or already dismissed in another tab says so instead of failing.

---

### Task 1: One page state for three sections, and shared notices

**Files:**
- Create: `src/lib/housekeeping/page-state.ts` (step A, pure; may go to Codex), `src/components/housekeeping/section-notices.tsx`
- Modify: `src/lib/housekeeping/photo-params.ts` (remove `photoHref`, keep the rest), `src/components/housekeeping/photos-section.tsx`, `photo-pager.tsx`, `per-page-select.tsx`, `duplicates-section.tsx`, `duplicate-pair-card.tsx`, `src/app/(app)/housekeeping/page.tsx`
- Delete: `src/components/housekeeping/duplicate-notices.tsx` (renamed)
- Test: `src/lib/housekeeping/__tests__/page-state.test.ts`; update `photo-params.test.ts` and the component tests that import the old names

**Interfaces:**
- Produces in `page-state.ts`:
  - `export type PageState = { tab: PhotoTab; per: PerPage; offset: number; dup: DuplicateKind | null; ttbOffset: number; ttbPer: PerPage }`
  - `export function parsePageState(sp: Record<string, string | string[] | undefined>): PageState` (reuses `parsePhotoParams` and `parseDuplicateKind`; `to` is the TTB offset, `tp` its page size, same rules as `offset` and `per`)
  - `export function pageHref(state: PageState, patch?: Partial<PageState>): string` — `/housekeeping?tab=..&per=..` then `&offset=` when above 0, `&dup=` when set, `&to=` when above 0, `&tp=` when not 8, in that order, so every existing address and test regex still holds.
- Produces in `section-notices.tsx`: `SectionNoticesProvider`, `SectionNoticeList`, `useSectionNotices` (the existing `duplicate-notices.tsx` code, renamed, behaviour unchanged).

- [ ] **Step 1: Write the failing tests** (`page-state.test.ts`): `parsePageState({})` is `{ tab: "labels", per: 8, offset: 0, dup: null, ttbOffset: 0, ttbPer: 8 }`; `to=16&tp=24&dup=stores&tab=barrels&per=12&offset=5` parses fully; every bad value (`to=-1`, `to=abc`, `tp=7`, `dup=categories`) falls back; arrays take the first entry. `pageHref` omits defaults as listed above; `pageHref(state, { tab: "vintages", offset: 0 })` changes only those and keeps `dup`, `ttbOffset` and `ttbPer`; the three sections' links built from one state never lose another section's values (a table of patches against a fully set state).
- [ ] **Step 2: Run to see them fail.** `npx vitest run src/lib/housekeeping/__tests__/page-state.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `page-state.ts`.** Then move each section and pager to take a `PageState` instead of `tab`/`per`/`offset`/`dup` and build every link and the per-page select's address with `pageHref`/`parsePageState`; delete `photoHref` and port its tests to `pageHref`; rename the notices module and its imports. No visible change.
- [ ] **Step 4: Run everything that touches the page.** `npx vitest run src/lib/housekeeping src/components/housekeeping`, `npm run typecheck`, and (against a throwaway database and dev server, as in the earlier plans) `npx playwright test e2e/housekeeping-photos.spec.ts e2e/housekeeping-duplicates.spec.ts --trace off`. Expected: all pass unchanged.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Give the Housekeeping page one state for all its sections"`.

---

### Task 2: The queue queries

**Files:**
- Create: `src/lib/housekeeping/ttb-queries.ts`
- Test: `src/lib/housekeeping/__tests__/ttb-queries.integration.test.ts` (skipped without a database; mock `server-only`; database name check as the other integration tests)

**Interfaces:**
- Produces: `export const TTB_SCOPE = "ttb"`; `export type TtbRow = { expressionId: number; name: string; brandName: string; meta: string }` (`name` is brand then label name as in the Photos cards; `meta` is `<category> · N bottles`); `export async function countLabelsWithoutTtb(ownerId: number): Promise<number>`; `export async function listLabelsWithoutTtb(ownerId: number, offset: number, limit: number): Promise<TtbRow[]>`; `export async function labelBelongsTo(ownerId: number, expressionId: number): Promise<boolean>`.

- [ ] **Step 1: Write the failing integration test.** Owner A: label L1 (no approval), L2 (one `expression_colas` row), L3 (no approval, dismissed under `TTB_SCOPE`), L4 (no approval), L5 (an approval row whose `fetch_error` is set; it counts as linked and is excluded), and a brand with two labels to check ordering by brand, then label name, then id. Owner B has an unapproved label. Assert: counts and lists exclude L2, L3 and L5 and B's label; B's own dismissals do not hide A's labels and A's do not hide B's; `meta` shows the category and bottle count (bottles of other owners never count); `offset`/`limit` page correctly and `limit` truncates; `labelBelongsTo` is true for A's label, false for B's and for a missing id.
- [ ] **Step 2: Run against the scratch database to see it fail.** Expected: FAIL (module not found); skipped without a database.
- [ ] **Step 3: Implement** with a left join to `expression_colas` (`colas.id IS NULL`) and the owner's dismissed ids from `listDismissed(ownerId, TTB_SCOPE)` as a `NOT IN` when non-empty; bottle counts by a grouped query joined in code (not a per-row subquery; see the Drizzle correlated-subquery note in memory).
- [ ] **Step 4: Run to see it pass**, then drop the scratch database.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the Housekeeping TTB queue queries"`.

---

### Task 3: The "Not on TTB" action

**Files:**
- Create: `src/app/(app)/housekeeping/ttb-actions.ts`
- Test: `src/app/(app)/housekeeping/__tests__/ttb-actions.test.ts` (mocks; no database)

**Interfaces:**
- Consumes: `labelBelongsTo`, `TTB_SCOPE` (Task 2), `dismiss` (PR #387).
- Produces (`"use server"`): `dismissTtbAction(input: { expressionId: number; name: string }): Promise<ActionResult>`. Success message `Marked “<name>” as not on TTB. It won’t be listed again.` The account comes only from the session; `expressionId` must be a positive integer; a label that is not the account's (or is missing) gives `That label is gone.` and changes nothing; unexpected errors are hidden behind `That did not save. Try again.`; success calls `revalidatePath("/housekeeping")`. The name in the message is the client's text, so it is only echoed, never stored.

- [ ] **Step 1: Write the failing tests:** bad ids (0, -1, 2.5, a string) refuse without calling the store; the session's id (not any owner in the request) is passed to `labelBelongsTo` and `dismiss(userId, "ttb", "<id>")`; not-owned gives the gone message and no dismissal; an unexpected throw gives the hidden message; success revalidates.
- [ ] **Step 2 to 4:** run to see them fail, implement, run to see them pass.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the Housekeeping Not on TTB action"`.

---

### Task 4: The section

**Files:**
- Create: `src/components/housekeeping/ttb-section.tsx` (server), `src/components/housekeeping/ttb-row.tsx` (client), `src/components/housekeeping/window-pager.tsx` (client)
- Modify: `src/app/(app)/housekeeping/page.tsx`
- Test: `src/components/housekeeping/__tests__/ttb-row.test.tsx`, `window-pager.test.tsx`

**Interfaces:**
- Consumes: `PageState`/`pageHref` (Task 1), `TtbRow`, `listLabelsWithoutTtb`, `countLabelsWithoutTtb` (Task 2), `dismissTtbAction` (Task 3), `ColaSearchDialog` and `AddById` from `@/components/expressions/cola-search-dialog`, `colaLookupEnabled` from `@/lib/cola/store` (read on the server and passed down as `lookupEnabled`), `pageWindow` from `photo-params`, the shared notices.
- Produces: `TtbSection({ state, total, rows, lookupEnabled })`, `TtbRowView({ row, lookupEnabled })` (client; `Find on TTB`, `AddById`, `Not on TTB`; on any success it reports through the notices, e.g. `Attached to “Old Forester 1920”.`, and its own text disappears when the refresh removes the row), and `WindowPager({ state, section: "ttb", total, window })` (client; Previous and Next links built with `pageHref`, range line `1–8 of 14`, disabled buttons at the ends, per-page select reading and writing `tp`).

- [ ] **Step 1: Write the failing tests** (`renderToStaticMarkup`, mock the actions, `next/navigation` and the dialog's server imports as the existing component tests do): a row shows brand and label name and its meta; with lookup on it has `Find on TTB`, the paste field labelled `TTB ID` and `Not on TTB`; with lookup off it has no `Find on TTB`, and the section shows `Searching TTB is off on this server. Paste a TTB ID or link instead.`; an empty list shows `Every label has a TTB approval, or you marked it as not on file.`; `WindowPager` shows the range, disables Previous on the first window and Next on the last, and its links keep `tab`, `per`, `offset`, `dup` while changing only `to`.
- [ ] **Step 2: Run to see them fail**, **Step 3: implement.** The section sits under Duplicates in `page.tsx`, reads `to`/`tp` from the page state, clamps with `pageWindow`, and the lede gains the label count.
- [ ] **Step 4: Run to see them pass**; typecheck; eslint.
- [ ] **Step 5: Look at it.** Throwaway database, `next dev -p 1966` on `localhost` (memory `dev-server-use-localhost.md`, `bulk-editor-verification-recipe.md`), `COLA_LOOKUP` on for one look and off for another; seed unapproved labels; read desktop and 390 px screenshots; open the real search dialog once (it needs network to TTB; if the machine cannot reach TTB, say so and check that the dialog opens and reports the failure plainly).
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add the Housekeeping TTB approvals section"`.

---

### Task 5: The end-to-end spec

**Files:**
- Create: `e2e/housekeeping-ttb.spec.ts`, `e2e/support/housekeeping-ttb.ts` (seed helpers, plain SQL, as the other housekeeping seeds)

- [ ] **Step 1: Write the spec** (read `e2e/housekeeping-duplicates.spec.ts` and its support file first). The dev server runs with `COLA_LOOKUP=false`, so adding by ID stores without fetching and the spec needs no network. Seed: eighteen labels with no approval, two with an approval row. Cases: (a) the section lists eight rows at first with the right range and the lede count, and Next shows the next window; (b) `Not on TTB` removes the row, leaves a notice, and the label is still gone after a reload and a different account still sees its own; (c) pasting a valid ID into a row attaches it (the `expression_colas` row exists) and the row leaves the list; (d) a malformed ID shows the plain error and keeps the row; (e) with lookup off the note shows and there is no `Find on TTB`; (f) changing the TTB page size or window does not change the Photos or Duplicates tabs, and changing those does not change the TTB window; (g) `to=999&tp=7` loads on the last full window; (h) a second tab clicking `Not on TTB` on an already-dismissed row says the label is gone or has already been handled instead of failing. One extra run with `COLA_LOOKUP` on checks that `Find on TTB` opens the dialog (it needs no network to open).
- [ ] **Step 2: Run it** against the dev server and a throwaway database: `npx playwright test e2e/housekeeping-ttb.spec.ts --trace off`. Expected: PASS once Tasks 1 to 4 are in; any failure is a finding.
- [ ] **Step 3: Run the neighbours** that share the page and the dialog: `e2e/housekeeping-photos.spec.ts`, `e2e/housekeeping-duplicates.spec.ts`, and the label-approvals specs in `e2e/expressions.spec.ts` / `e2e/catalog.spec.ts`; report failures by name, noting whether they also fail on `main` (two known: `catalog.spec.ts:258` and `expressions.spec.ts:63`).
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add the Housekeeping TTB end-to-end spec"`. In the PR show test counts: CI does not run Playwright or the database-backed suites.
