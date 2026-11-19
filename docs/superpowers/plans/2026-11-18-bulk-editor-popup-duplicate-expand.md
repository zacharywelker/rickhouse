# Bulk editor popup, Duplicate and Expand record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the app's real label and bottle forms in a popup over the bulk editor, and use it for Duplicate bottle, Duplicate label and Expand record (saved and unsaved rows).

**Architecture:** A `@modal` parallel route under the bulk editor renders the real pages inside a dialog through intercepting routes (proven in the spec's "Mechanism test result"). A small `PopupApi` context lets a form say "saved" or "cancel" in the popup while behaving as today on a full page. A multi-step Expand is a URL chain (`?next=`), a new row's typed values travel in `sessionStorage`, and the sheet holds a new row back from autosave while its popup is open.

**Tech Stack:** Next 16 App Router (intercepting + parallel routes), React 19, Radix dialog (existing), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-bulk-editor-row-menu-design.md` (approved; read "Expand record", "The menu" and "Mechanism test result")

**Scope and starting point:** Follows `2026-11-18-bulk-editor-row-menu.md` (PRs #378 menu and #379 Insert). Branch from `origin/main` once they merge, otherwise stack on `claude/bulk-row-insert`. The bulk editor page now lives in the `(wide)` route group (`src/app/(wide)/bulk-editor/`); `(...)` interception paths ignore groups, so the slot goes there and intercepts `expressions/...` and `bottles/...`. Four PRs: C (Tasks 1 to 3), D (Tasks 4 to 5), E (Tasks 6 to 7), F (Tasks 8 to 10).

## Global Constraints

- The popup renders the **real routes**: `/expressions/[id]/edit`, `/expressions/new`, `/bottles/[id]/edit`, `/bottles/new` (with `?duplicate=`) and `/bottles/add`. Never go through a route that redirects (`/bottles/new` without `?duplicate=` redirects to `/bottles/add` when `searchFirstAdd` is on and leaves the sheet).
- A form outside the popup behaves exactly as today; `usePopup()` returns `null` there and a `next` or `prefill` parameter is ignored.
- Nothing is saved twice and no typed value is lost silently. A new row being expanded is held back from the sheet's autosave until its popup closes.
- Duplicate label copies fields and distillery, mashbill, finish and ingredient links; never bottles, photos, COLA approvals, other names or vintages. Duplicate bottle uses the existing duplicate page (it copies no rating or tasting history: those live in `tasting_notes`).
- Forms that are redesigned later keep using `usePopup()` for save and cancel; a comment on `PopupApi` says so.
- Each PR is its own branch; CI skips Playwright and the DB-backed suites, so show scratch-database counts in each PR. Rebuild `node_modules` with `npm ci` if zod is not 4.x. Kill servers by PID.

## Review Focus

- A new row being expanded must not be created by the sheet's autosave while the popup is open (focus leaving the sheet calls `saver.saveDrafts()`), or the row is made twice. Pinned in Task 8 and Task 10.
- Opening Expand on a saved row with unsaved sheet cells must save them first and not open if that fails, so the popup never shows stale values. Pinned in Task 7.
- Closing the popup with entries typed in the form (Escape, the overlay, the X, Cancel) asks first. Pinned in Task 1 and Task 3.
- A typed sheet value the form cannot take is reported, never dropped silently; Cancel leaves the new row exactly as it was. Pinned in Task 8 and Task 10.
- A hard load or reload of a popup URL (including one with `?next=`) shows the full page and works as today. Pinned in Task 3.

---

## Part 1 (PR C): the popup, and Duplicate bottle

### Task 1: The popup frame and its slot

**Files:**
- Create: `src/lib/bulk-editor/popup-nav.ts`, `src/lib/bulk-editor/__tests__/popup-nav.test.ts`
- Create: `src/components/popup/popup.tsx`
- Create: `src/app/(wide)/bulk-editor/layout.tsx`, `src/app/(wide)/bulk-editor/@modal/default.tsx`
- Create under `src/app/(wide)/bulk-editor/@modal/`: `(...)expressions/[id]/edit/page.tsx`, `(...)expressions/new/page.tsx`, `(...)bottles/[id]/edit/page.tsx`, `(...)bottles/new/page.tsx`, `(...)bottles/add/page.tsx`. Each is the real page's default export (same props) inside `<PopupFrame>`.

**Interfaces:**
- Produces, in `popup-nav.ts` (pure):
  ```ts
  export const POPUP_SAVED_EVENT = "bulk-editor:popup-saved";
  export type PopupSaved = { labelId?: number; bottleId?: number };
  /** The first url, carrying the rest as `next` (nested), plus `step` and `of` for the frame's heading. */
  export function chain(steps: string[]): string;
  export function nextOf(search: URLSearchParams): string | null;
  export function stepOf(search: URLSearchParams): { step: number; of: number } | null;
  ```
- Produces, in `popup.tsx`:
  ```ts
  /** The forms call this: it is null on a full page. Keep using it when a form is redesigned. */
  export type PopupApi = { saved: (result: PopupSaved) => void; close: () => void };
  export function usePopup(): PopupApi | null;
  export function PopupFrame(props: { children: React.ReactNode }): JSX.Element;
  ```
  `saved`: with a `next` in the URL, `router.replace(next)`; otherwise dispatch `POPUP_SAVED_EVENT` (`CustomEvent<PopupSaved>`) on `window`, `router.refresh()`, then `router.back()`. `close`: `router.back()`. The frame is a large scrolling `ui/dialog` (`max-w-4xl`, body scrolls), shows "Step 1 of 2" from `stepOf`, and routes Escape, the overlay, the X and `close` through a guard: if any `input` or `change` event has fired inside the frame since this step opened, a built-in confirm dialog ("Discard what you entered?" Discard / Keep editing) is shown first (not `window.confirm`).

- [ ] **Step 1: Write the failing tests** in `popup-nav.test.ts`: `chain(["/expressions/7/edit", "/bottles/12/edit"])` equals `"/expressions/7/edit?next=%2Fbottles%2F12%2Fedit&step=1&of=2"`; `chain(["/a"])` equals `"/a"`; `nextOf(new URLSearchParams("next=%2Fbottles%2F12%2Fedit"))` is `"/bottles/12/edit"`; `stepOf` of that url's params is `{ step: 1, of: 2 }` and of a plain url is `null`; a `next` that does not start with `/` (or starts with `//`) is refused: `nextOf` returns `null` (no open redirect).
- [ ] **Step 2:** `npx vitest run src/lib/bulk-editor/__tests__/popup-nav.test.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement `popup-nav.ts`. A step after the first carries `step=2&of=2` in its own url, so `chain` puts the heading params on each url it builds.
- [ ] **Step 4:** Same command; expect PASS.
- [ ] **Step 5:** Build the frame, the layout (`{children}{modal}`), the slot default (returns `null`) and the five intercepting pages. `npm run typecheck && npm run lint`; expect clean.
- [ ] **Step 6:** Commit `feat(bulk-editor): a popup for the real pages`. (End-to-end proof comes with Task 3, the first caller.)

### Task 2: A way for the sheet to open the popup and take the result

**Files:** `src/components/bulk-editor/bulk-editor.tsx`, `src/lib/bulk-editor/__tests__/popup-nav.test.ts` (no new pure code)

**Interfaces:**
- Consumes: `POPUP_SAVED_EVENT`, `PopupSaved`.
- Produces, in the sheet: `openPopup(url: string): void` (`router.push(url)`), and a listener for `POPUP_SAVED_EVENT` that, for `bottleId` or `labelId`, keeps that row on screen and flashes it by calling the same function the saver's `onLanded` is wired to (find it in `bulk-editor.tsx`; the key is `b${bottleId}` or `l${labelId}`), after the refresh has delivered the row.

- [ ] **Step 1:** Add `openPopup` and the listener (effect on mount, removed on unmount). No test of its own: Task 3's e2e exercises it.
- [ ] **Step 2:** `npm run typecheck && npm run lint`. Commit `feat(bulk-editor): the sheet opens the popup and shows what it saved`.

### Task 3: Duplicate bottle

**Files:** `src/components/expressions/bottle-form.tsx` (popup mode), `bulk-editor.tsx` (handler), `src/components/bulk-editor/row-menu.tsx` (no change; the handler enables the item), `e2e/bulk-editor-popup.spec.ts`

**Interfaces:**
- Consumes: `usePopup()`; `rowMenuItems` already returns `duplicateBottle` with its dimming rules.
- Changes in `BottleForm`: after a save, `popup ? popup.saved({ bottleId: createdId }) : (router.push(...), router.refresh())` (today at `bottle-form.tsx:368`); the Cancel link becomes a button calling `popup.close()` inside a popup.
- Handler: `duplicateBottle` opens `/bottles/new?duplicate=${row.bottle.id}`.

- [ ] **Step 1: Write the failing e2e** in `e2e/bulk-editor-popup.spec.ts` (same `beforeAll` and sign-in as `bulk-editor-row-menu.spec.ts`; use CSS selectors for anything behind the dialog, since Radix hides the page from role queries):
  - `Duplicate bottle opens the existing duplicate page in a popup over the sheet`: right-click a bottle row, choose Duplicate bottle; the dialog shows "Duplicate bottle" and the form; the sheet is still mounted behind it; a hard load of the same URL shows the full page with no dialog.
  - `saving the duplicate closes the popup, adds the bottle to the sheet, and leaves the original, with no rating or tasting copied`: the label's bottle count in the database goes from 1 to 2; the new row is flashed.
  - `Cancel closes the popup; with something typed it asks first, for Escape and for Cancel`: type in a field, press Escape, expect "Discard what you entered?", choose Keep editing (popup stays), then Discard (closes).
  - `Duplicate bottle is dimmed on a label with no bottle`.
- [ ] **Step 2:** Run `npx playwright test e2e/bulk-editor-popup.spec.ts --trace off`; expect FAIL.
- [ ] **Step 3:** Implement the `BottleForm` popup mode and the handler.
- [ ] **Step 4:** Re-run the spec; expect PASS. Run `e2e/bulk-editor.spec.ts` and `e2e/expressions.spec.ts`-style bottle form specs (`grep -l "bottles/new" e2e/*.spec.ts`); counts must match their baseline on `origin/main`. `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 5:** Commit `feat(bulk-editor): Duplicate bottle`. Open PR C with scratch-database counts.

---

## Part 2 (PR D): Duplicate label

### Task 4: The source label as a form's starting values (pure)

**Files:** Create `src/lib/expressions/duplicate-label.ts`, `src/lib/expressions/__tests__/duplicate-label.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function duplicateLabelValues(source: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null>;
  ```
  The source label's form values without `name`, `slug`, photo fields and ids that belong to the original; everything else kept.

- [ ] **Step 1: Write the failing tests:** the name is blank, `slug` is gone, `brandId`, `categoryId`, `proof`, `ageYears`, `isStraight` survive, a photo field and any `id` are gone; the input object is not changed.
- [ ] **Step 2:** Run it; expect FAIL. **Step 3:** Implement (list the dropped keys from `expressionSchema` and the label's photo columns). **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(expressions): what a duplicated label starts with`.

### Task 5: `/expressions/new?duplicate=`, the form's popup mode, and the menu item

**Files:** `src/app/(app)/expressions/new/page.tsx`, `src/components/expressions/expression-form.tsx`, `bulk-editor.tsx`, `e2e/bulk-editor-popup.spec.ts`

**Interfaces:**
- `NewExpressionPage` reads `searchParams.duplicate`; with a valid id it loads the source with `getExpression(id, user.id)` and `expressionFormData(id, user.id)` (for its links), 404s if it is not the owner's, and renders `ExpressionForm` directly (no search start) with `initialValues = duplicateLabelValues(source)`, `initialLinks` from the source, heading "Duplicate label" and a one-line note that its bottles, photos and approvals are not copied. Without the parameter it is unchanged.
- `ExpressionForm`: after a save, `popup ? popup.saved({ labelId: savedId }) : (router.push(...), router.refresh())` (the effect at `expression-form.tsx:698`); the "Create Label & Add bottle" path inside a popup also ends with `popup.saved` (the add-bottle step is the owner's to do next); Cancel calls `popup.close()` in a popup.
- Handler: `duplicateLabel` opens `/expressions/new?duplicate=${row.label.id}`.

- [ ] **Step 1: Write the failing e2e** (in `bulk-editor-popup.spec.ts`): `Duplicate label opens the New Label form filled from the source, with the name empty, in a popup`; `saving it makes one new label with no bottles and the source keeps its bottle` (database counts: labels +1, bottles unchanged); `a duplicate that keeps the source's name and brand either saves or says why, and never creates two labels` (the builder checks the slug and name constraint first: if a same-name label is rejected, the name stays blank and required; the spec says the owner changes it); `a source label that is not the signed-in owner's is a 404`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement. **Step 4:** Re-run; then the existing label specs (`grep -l "expressions/new" e2e/*.spec.ts`) against their `origin/main` baseline. `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 5:** Commit `feat(bulk-editor): Duplicate label`. Open PR D with counts.

---

## Part 3 (PR E): Expand record on saved rows

### Task 6: Which pages a row expands to (pure)

**Files:** Create `src/lib/bulk-editor/expand.ts`, `src/lib/bulk-editor/__tests__/expand.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** The popup urls for a row, in order (chained by `chain`), or null when it cannot be expanded. New rows are Task 9. */
  export function expandSteps(row: SheetRow, view: SheetView): string[] | null;
  ```
  Saved row: Labels-only `["/expressions/{label.id}/edit"]`; Bottles-only `["/bottles/{bottle.id}/edit"]`; Both with a bottle `["/expressions/{label.id}/edit", "/bottles/{bottle.id}/edit"]`; Both with no bottle `["/expressions/{label.id}/edit"]`. A draft returns `null` here.

- [ ] **Step 1: Write the failing tests** for those four cases and for a draft (null). **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS. **Step 5:** Commit `feat(bulk-editor): where a saved row expands to`.

### Task 7: Expand on a saved row, saving its pending cells first

**Files:** `src/components/bulk-editor/use-row-saver.ts` (one addition), `bulk-editor.tsx`, `ExpressionForm`/`BottleForm` (popup mode already done in Tasks 3 and 5), `e2e/bulk-editor-popup.spec.ts`

**Interfaces:**
- `useRowSaver` returns a new `stateNow: (key: string) => RowState | undefined`, read from a ref kept in step with `rowState`, so a caller can look after `await save(key)` without a stale closure.
- The sheet's `expandRow(row)`: for a saved row, `await saver.save(key)` for each of the row's keys that has pending cells (the row's key, `l${label.id}`, and its vintage key if present); if any `stateNow(key)?.kind === "blocked"`, do not open (the failure already shows on the cell); otherwise `openPopup(chain(expandSteps(row, view)))`. The menu's `expand` handler calls it, and the item is dimmed for a draft until Task 10.

- [ ] **Step 1: Write the failing e2e:**
  - `Expand in the Labels-only view opens the label's edit page`; `Expand in the Bottles-only view opens the bottle's edit page`.
  - `Expand in the Both view opens the label, then the bottle, with "Step 1 of 2"; saving the label moves to the bottle; saving the bottle closes the popup and the sheet shows both changes`.
  - `a label with no bottle expands to the label alone`.
  - `a row with an unsaved cell saves it before the popup opens, and the popup shows the saved value` (type a price, expand at once, expect the form's field to hold it and the database to have it).
  - `a row whose pending cell fails to save does not open the popup` (a value the server rejects).
  - `a hard load of a chained url shows the full page and works as before`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement. **Step 4:** Re-run, then the full `e2e/bulk-editor.spec.ts` and `e2e/bulk-editor-row-menu.spec.ts` against their baselines. `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 5:** Commit `feat(bulk-editor): Expand record on saved rows`. Open PR E with counts.

---

## Part 4 (PR F): Expand record on new rows

### Task 8: What a new row hands to the form (pure)

**Files:** Modify `src/lib/bulk-editor/save.ts` (extract, no behaviour change), `src/lib/bulk-editor/expand.ts`; tests in `save.test.ts` (existing, must stay green) and `expand.test.ts`

**Interfaces:**
- In `save.ts`, `createBody`'s first loop moves into `export function cellFields(cells: Readonly<Record<string, string>> | undefined): { facts: Record<string, unknown>; bottle: Record<string, unknown> }`; `createBody` calls it. Its output must not change (the existing `createBody` tests pin that).
- In `expand.ts`:
  ```ts
  export type Prefill = { label: Record<string, unknown>; bottle: Record<string, unknown>; dropped: string[] };
  /** What to hand the form for a new row: its picks, its typed cells (`cellFields`) and its waiting choices. `dropped` names typed columns the form cannot take, to be told to the person. */
  export function expandPrefill(draft: DraftRow, cells: Readonly<Record<string, string>> | undefined, pending: Readonly<Record<string, string>> | undefined, view: SheetView): Prefill;
  /** The popup urls for a new row, with `prefill=<token>` added; null when it cannot be expanded (Bottles-only view and no existing label). */
  export function expandStepsForDraft(draft: DraftRow, view: SheetView, token: string): string[] | null;
  ```
  Urls: Labels-only, new label: `["/expressions/new?prefill=T"]`; Labels-only with an existing label chosen: `["/expressions/{id}/edit"]`; Bottles-only with an existing label: `["/bottles/add?expression={id}&prefill=T"]`; Both: `["/bottles/add?prefill=T"]`, with `&expression={id}` when the label exists. Label values: brand by id or `brandName`, label `name`, `categoryId`, then the typed facts; a pending brand or label text fills `brandName` or `name` only when the row has not chosen one.

- [ ] **Step 1: Write the failing tests:** the owner's case (a draft with a new brand "Zed" and label "Zed Batch", no category): `expandPrefill` gives `label` with `brandName: "Zed"`, `name: "Zed Batch"` and no `categoryId`, `dropped` empty; a typed price lands in `bottle.pricePaid` and a typed proof in `label.proof`; an existing label by id; a pending brand text fills `brandName` when none is chosen and is ignored when one is; a typed column with no form field appears in `dropped` by its column's name; `expandStepsForDraft` for each of the five url cases above, and `null` for Bottles-only with a new label.
- [ ] **Step 2:** `npx vitest run src/lib/bulk-editor/__tests__/expand.test.ts src/lib/bulk-editor/__tests__/save.test.ts`; expect FAIL on the new tests only. **Step 3:** Implement; confirm every existing `save.test.ts` test still passes. **Step 4:** Run; PASS.
- [ ] **Step 5:** Commit `feat(bulk-editor): what a new row hands to the form`.

### Task 9: Carrying the values in, and the forms' prefill and popup mode

**Files:** Create `src/lib/popup/prefill.ts`, `src/lib/popup/__tests__/prefill.test.ts`; modify `NewLabelStart` (`new-label-start.tsx`), `CatalogBottle` (`catalog-bottle.tsx`), `BottleForm` for the add-bottle path; `e2e/bulk-editor-popup.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Stores the prefill in sessionStorage and returns its token. */
  export function writePrefill(prefill: Prefill): string;
  /** Reads it (does not remove it, so a re-render or a StrictMode double effect still finds it). */
  export function readPrefill(token: string | null): Prefill | null;
  export function clearPrefill(token: string): void;
  ```
- `NewLabelStart` reads `?prefill=` through `useSearchParams` and `readPrefill`; with a prefill it skips the search start and renders `ExpressionForm` with `initialValues` from `prefill.label`. `CatalogBottle` does the same for `/bottles/add` (label values for a new label, bottle values for the bottle) and, in a popup, calls `popup.saved({ labelId, bottleId })` instead of `router.push` (`catalog-bottle.tsx:346`) and `popup.close()` for Cancel. Without a prefill, both are unchanged.

- [ ] **Step 1: Write the failing unit tests** (jsdom or a `sessionStorage` stub, as the repo's other client tests do): `readPrefill(writePrefill(p))` equals `p`; an unknown or null token gives `null`; `clearPrefill` removes it; corrupt stored JSON gives `null` and does not throw.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement `prefill.ts`. **Step 4:** Run; PASS.
- [ ] **Step 5:** Wire the three components. Write failing e2e in `bulk-editor-popup.spec.ts` first: `a /expressions/new?prefill= token opens the form filled` (set `sessionStorage` then navigate in the sheet) and `a /bottles/add?prefill= token opens the add-bottle page with the label and the bottle values filled`. Run to see them fail, implement, run to see them pass; `e2e/catalog.spec.ts` must match its baseline.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm test`. Commit `feat: the new-label and add-bottle pages take a prefill and work in the popup`.

### Task 10: Expand on a new row

**Files:** `bulk-editor.tsx`, `src/components/bulk-editor/use-row-saver.ts`, `e2e/bulk-editor-popup.spec.ts`

**Interfaces:**
- `useRowSaver` input gains `held: ReadonlySet<string>`; `save(key)` returns early for a key in `held`, and `saveDrafts` skips held keys. The sheet keeps `held` as state.
- The sheet's `expandRow(row)` for a draft: build `expandPrefill` from `drafts`, `edits[row.key]` and its pending cells; if `dropped` is not empty, push a notice naming them ("Not carried into the form: Distillery"); `writePrefill`; add the draft's key to `held`; `openPopup(chain(expandStepsForDraft(...)))`.
- On `POPUP_SAVED_EVENT` while a draft is held: remove that draft and everything typed into it (the same removals as `discardDraft`), clear the prefill, release the key, and keep the created row on screen and flashed (`labelId` or `bottleId` from the event). When the popup closes without a save (the URL returns to `/bulk-editor` with no event), release the key and clear the prefill; the draft is untouched.
- A held draft that is closed by Cancel then behaves as before, including autosave when the cursor leaves it.

- [ ] **Step 1: Write the failing e2e:**
  - `Expand on a new row with a brand and a label name and no category opens the New Label form filled with them, and saving it makes a saved row` (the owner's case, Labels-only view; database: one new label, none before).
  - `Expand on a new row in the Both view opens the add-bottle page with a new label and the typed price; saving makes the label and its bottle once` (counts +1 and +1; the draft is gone from the sheet; the new row is flashed).
  - `a complete new row (brand and an existing label) that is expanded is not created while the popup is open` (wait 2.5 s with the popup open and the focus away from the sheet: the bottle count for that label has not changed; then Cancel: the row is still there and still saves when the cursor leaves it).
  - `Expand in the Bottles-only view is dimmed until the row names an existing label`.
  - `a typed value the form cannot take is named in a notice, and is still in the new row after Cancel`.
  - `Cancel leaves the new row and everything typed in it as it was`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement. **Step 4:** Re-run; then the full `e2e/bulk-editor.spec.ts`, `e2e/bulk-editor-row-menu.spec.ts` and `e2e/catalog.spec.ts` against their baselines (the known `:1736` failure may remain; nothing else). `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 5:** Commit `feat(bulk-editor): Expand record on new rows`. Open PR F with counts.
