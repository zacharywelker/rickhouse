# Bulk editor row menu (menu, deletes, Insert) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click on a bulk editor row opens an app menu with Delete label, Delete bottle (or Discard new row) and a positional Insert record below; it also settles, by a throwaway test, how Expand record will show real pages in a popup.

**Architecture:** A pure module (`row-menu.ts`) decides which menu items a row gets and what each deletes. A thin Radix context-menu wrapper renders them around the sheet's `TableBody`. The delete dialog is lifted out of `DeleteBar` so the menu and the bar share it. Insert adds an anchored, prefilled draft that the sheet orders next to its anchor and never saves until something is typed in it.

**Tech Stack:** Next 16 (App Router), React 19, `@radix-ui/react-context-menu` (new), Vitest (`npm test`), Playwright (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-18-bulk-editor-row-menu-design.md` (approved 2026-11-18)

**Scope:** The spec's build order has four steps. This plan covers steps 1 and 2 (Parts 1 to 3). **Duplicate bottle, Duplicate label and Expand record each get their own plan after Task 1 reports**, because Expand's mechanism is not proven yet and Duplicate rides on it. Menu items without a handler in this plan (Expand, both Duplicates) are not rendered, so no dead item ships.

## Global Constraints

- Square corners, paper and ink, flat offset shadow (DESIGN.md); destructive items use the error colour.
- Right-click is replaced on sheet rows only, never in the find bar, panels or open cell editors.
- Deleting always goes through the existing server-counted confirm dialog; the menu acts on the clicked row only, never on ticked rows.
- New rows are client state until saved; an Insert must never create anything on the server by itself.
- Each part is its own PR from a fresh `origin/main`. CI does not run the DB-backed suites or Playwright: show a scratch-database run with counts in the PR.
- Never `pkill -f`; kill by PID. Assert the database name before `reset.ts`.

## Review Focus

- An Insert whose cursor then leaves without typing must not create an empty bottle (the saver saves a new row when the cursor leaves it, if `draftNeeds` is null). Pinned in Task 6 (`isBlank`) and Task 7 (e2e).
- Right-click inside an open cell editor must keep the browser menu (paste). Pinned in Task 5 (e2e).
- The row under the menu is deleted or reloaded while the menu is open: the action finds the row by key and does nothing if it is gone. Pinned in Task 5.
- Right-click on the row's checkbox or row-number cell opens that row's menu, not nothing. Pinned in Task 5.
- Delete label from a bottle row whose label has other bottles: the dialog states the server's bottle count and the sheet drops those rows after the refresh. Pinned in Task 5 (e2e).

---

## Part 1: Mechanism test (no PR; its result is written into the spec)

### Task 0: Branch hygiene

- [ ] **Step 1:** `git fetch origin && git ls-remote origin 'refs/heads/claude/*'` and `gh pr list --state all --search "context menu"`, `gh pr list --state all --search "bulk editor row"`. Expected: no branch or PR already doing this; if one exists, build on it and stop here.
- [ ] **Step 2:** `git worktree add .claude/worktrees/row-menu -b claude/bulk-row-menu origin/main`, then in it `cp -al ../../../node_modules node_modules` (remove an empty `node_modules` first; see memory `ingredients-gotchas`).
- [ ] **Step 3:** Throwaway database and dev server as in memory `bulk-editor-verification-recipe` (`rickhouse_rowmenu_test`, migrate, `reset.ts`, `seed.ts`, `next dev -p 1965`, `http://localhost:1965`, `member` / `smoke-test-password`). Seed labels and bottles through `src/lib/bulk-editor/rows` `createRow`.

### Task 1: Does a real route render in a dialog over `/bulk-editor`?

**Files (all on a scratch branch `spike/row-menu-modal`, deleted after):**
- Create: `src/app/(app)/bulk-editor/layout.tsx` (renders `{children}{modal}`)
- Create: `src/app/(app)/bulk-editor/@modal/default.tsx` (returns `null`)
- Create: `src/app/(app)/bulk-editor/@modal/(...)expressions/[id]/edit/page.tsx` (a `Dialog` around the real `EditExpressionPage` default export, called with the same `params`)
- Create: `src/app/(app)/bulk-editor/@modal/(...)bottles/new/page.tsx` (same, around `NewBottlePage`)
- A temporary link/button on the bulk editor page that does `router.push` to each URL.

- [ ] **Step 1:** Build the above. Type a value into a cell and leave it unsaved, so there is live sheet state to lose.
- [ ] **Step 2:** In Playwright, from `/bulk-editor` soft-navigate to `/expressions/<id>/edit`. Record: does the dialog show over the sheet; is the typed cell still there; does a hard reload of that URL show the full page.
- [ ] **Step 3:** Turn on the `searchFirstAdd` preference, soft-navigate to `/bottles/new`. Record: is the redirect to `/bottles/add` intercepted (dialog shows) or does it leave the sheet.
- [ ] **Step 4:** In the dialog, save a label edit. Record: where `router.push` at `src/components/expressions/expression-form.tsx:698` sends the page, and whether `router.refresh()` updates the sheet behind.
- [ ] **Step 5:** Write the four findings under a new "Mechanism test result" heading in the spec, with one line on what it means for the Expand plan (embed `/bottles/add` directly if the redirect case failed, as the spec already assumes). Delete the scratch branch. Report to the owner before planning Expand.

---

## Part 2: PR A, the menu with Delete label, Delete bottle and Discard

**Files:**
- Create: `src/lib/bulk-editor/row-menu.ts`, `src/lib/bulk-editor/__tests__/row-menu.test.ts`
- Create: `src/components/ui/context-menu.tsx`, `src/components/bulk-editor/row-menu.tsx`
- Modify: `src/components/bulk-editor/delete-bar.tsx` (extract `DeleteDialog`), `src/components/bulk-editor/bulk-editor.tsx` (wire the menu)
- Modify: `package.json`, `package-lock.json` (new dependency)
- Create: `e2e/bulk-editor-row-menu.spec.ts`

### Task 2: What a row's menu contains (pure)

**Interfaces:**
- Produces, in `row-menu.ts`:
  ```ts
  export type MenuItemId = "expand" | "insert" | "duplicateBottle" | "duplicateLabel" | "deleteLabel" | "deleteBottle" | "discard";
  export type MenuItem = { id: MenuItemId; label: string; hint?: string; disabled?: string; danger?: boolean; group: 0 | 1 | 2 };
  export function rowMenuItems(row: SheetRow, view: SheetView, opts: { blank: boolean }): MenuItem[];
  export function menuDeleteIds(id: "deleteLabel" | "deleteBottle", row: SheetRow): DeleteIds;
  ```
  `disabled` holds the reason, shown as the item's tooltip. Groups: 0 Expand and Insert, 1 the Duplicates, 2 the deletes.
- Consumes: `SheetRow`, `SheetView` (`lib/bulk-editor/sheet.ts`), `DeleteIds` (`lib/bulk-editor/delete.ts`).

- [ ] **Step 1: Write the failing tests** in `row-menu.test.ts`, building rows with the cast pattern used in `drafts.test.ts`:
  - saved bottle row, Both view: ids in order `expand, insert, duplicateBottle, duplicateLabel, deleteLabel, deleteBottle`, none disabled; `deleteLabel` has `danger` and `hint: "And its bottles"` when `label.bottleCount > 0`, no hint when 0.
  - saved label row with no bottle (`bottle: null`, `view.bottles` true): `duplicateBottle` and `deleteBottle` have a `disabled` reason; `deleteLabel` has no hint.
  - Labels-only view (`view.bottles` false): same two items disabled.
  - draft row (`row.draft` set): ids `expand, insert, duplicateBottle, duplicateLabel, discard`; both Duplicates disabled ("Not saved yet"); no `deleteLabel`/`deleteBottle`; `discard` is `danger` and disabled only when `opts.blank`.
  - draft in Bottles-only view whose label is new (`draft.labelIsNew` or no label chosen): `expand` disabled with "Choose a label first"; with an existing label chosen it is enabled.
  - `menuDeleteIds("deleteLabel", bottleRow)` is `{ labelIds: [bottleRow.label.id], bottleIds: [] }`; `menuDeleteIds("deleteBottle", bottleRow)` is `{ labelIds: [], bottleIds: [bottleRow.bottle.id] }`.
- [ ] **Step 2:** Run `npx vitest run src/lib/bulk-editor/__tests__/row-menu.test.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement `rowMenuItems` and `menuDeleteIds` as above. The hint is "And its bottles" with no number on purpose: `label.bottleCount` omits sold and wishlist bottles, and the dialog shows the server's real count.
- [ ] **Step 4:** Run the same command; expect PASS. Then `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(bulk-editor): what a row's menu contains`.

### Task 3: Lift the delete dialog out of `DeleteBar`

**Interfaces:**
- Produces, exported from `delete-bar.tsx`:
  ```ts
  export function DeleteDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; ids: DeleteIds; onDone: (outcome: DeleteOutcome) => void }): JSX.Element;
  ```
  It fetches `deleteImpactAction(ids)` when `open` becomes true and holds the confirm, failure and summary state that `DeleteBar` holds today. `DeleteBar`'s props and behaviour do not change; it renders `DeleteDialog`.

- [ ] **Step 1:** Run the existing delete e2e and unit tests as a baseline: `npx vitest run src/lib/bulk-editor/__tests__/delete.test.ts` and the delete cases in `e2e/bulk-editor.spec.ts` (`npx playwright test e2e/bulk-editor.spec.ts -g "delete" --trace off`). Expect PASS; note the counts.
- [ ] **Step 2:** Extract `DeleteDialog` (move `impact`, `deleting`, `failures`, `summary`, `confirm` and the `<Dialog>` into it; load impact in an effect keyed on `open`). `DeleteBar` keeps only the bar and an `open` state.
- [ ] **Step 3:** Re-run Step 1's commands; expect the same counts, all PASS. `npm run typecheck`.
- [ ] **Step 4:** Commit `refactor(bulk-editor): share the delete dialog`.

### Task 4: The menu component

**Interfaces:**
- Consumes: `MenuItem` from Task 2.
- Produces:
  - `src/components/ui/context-menu.tsx`: `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, thin wrappers over `@radix-ui/react-context-menu`, styled like `ui/dialog.tsx` and `ui/popover.tsx` (square corners, `border-border`, `bg-card`, the flat offset shadow from DESIGN.md §4.2).
  - `row-menu.tsx`: `export function RowMenuContent(props: { items: MenuItem[]; handlers: Partial<Record<MenuItemId, () => void>>; onCloseAutoFocus: (event: Event) => void }): JSX.Element`. Items without a handler are not rendered; a separator is drawn between non-empty groups; `danger` items use the destructive colour; `disabled` items are `aria-disabled` with the reason as `title`.

- [ ] **Step 1:** `npm install @radix-ui/react-context-menu`; confirm the resolved version's React 19 peer range and that `package-lock.json` changed only for this package.
- [ ] **Step 2:** Write both files.
- [ ] **Step 3:** `npm run typecheck && npm run lint`; expect clean.
- [ ] **Step 4:** Commit `feat(bulk-editor): a context menu component`.

### Task 5: Wire the menu into the sheet

**Files:** `bulk-editor.tsx`; the `TableBody` at the `onKeyDown={onKeyDown}` line.

**Interfaces:**
- Consumes: `rowMenuItems`, `menuDeleteIds` (Task 2), `DeleteDialog` (Task 3), `RowMenuContent` (Task 4), existing `cellOf`, `place`, `focusAfter`, `isBlank`, `afterDelete`, `statusOf`.

- [ ] **Step 1: Write the failing e2e** in `e2e/bulk-editor-row-menu.spec.ts` (same `beforeAll`/`beforeEach` as `bulk-editor.spec.ts`, Both view):
  - `right-click on a bottle row opens the app menu, not the browser's`: `click({ button: "right" })` on a cell; `getByRole("menu")` visible with items "Delete label" and "Delete bottle"; the cursor moved to that row.
  - `Shift+F10 opens it on the cursor row`.
  - `Delete bottle asks, then removes the bottle and keeps the label`: counts before/after from the dialog text and the row count.
  - `Delete label from a bottle row names the bottle count and drops every row of that label after the refresh`.
  - `right-click inside an open cell editor shows no app menu`.
  - `right-click on the row checkbox cell opens that row's menu`.
  - `right-click on the empty new row shows Discard new row, dimmed`.
- [ ] **Step 2:** `npx playwright test e2e/bulk-editor-row-menu.spec.ts --trace off`; expect FAIL.
- [ ] **Step 3:** Implement in `bulk-editor.tsx`:
  - Wrap the `TableBody` in `ContextMenu` + `ContextMenuTrigger asChild`, with `disabled={editing !== null}` so an open editor keeps the browser menu. Radix opens the menu from the keyboard's context-menu key on the focused cell, with no extra code.
  - `onContextMenu` on the `TableBody`: `const hit = cellOf(event.target)`; if none, fall back to the row of the nearest `tr` (give `SheetRowView`'s row a `data-row` index if it has none) so the checkbox cell works; if there is still no row, `event.preventDefault()`. Otherwise `place(hit.pos)`, store the row's **key** in `menuRowKey` state.
  - Menu items from `rowMenuItems(row, view, { blank })` where the row is looked up by `menuRowKey` at render and action time (no row found: close and do nothing). `blank` is the same `isBlank(...)` test `statusOf` uses.
  - Handlers: `deleteLabel` / `deleteBottle` set `deleteIds = menuDeleteIds(id, row)` and open a `DeleteDialog` rendered once next to `DeleteBar`, with `onDone={afterDelete}`. `discard` removes the draft: same removals as the existing "discard not saved" button (the `setEdits`, `setDrafts`, `setPending`, `setMoves` filters on that key).
  - `onCloseAutoFocus`: `event.preventDefault()`, then `focusAfter.current = true` and re-`place` the cursor cell, as `go` does.
- [ ] **Step 4:** Re-run the spec; expect PASS. Run `npx vitest run src/lib/bulk-editor` and the full `e2e/bulk-editor.spec.ts`; expect the same counts as the baseline in Task 3 plus the new cases.
- [ ] **Step 5:** `npm run typecheck && npm run lint`. Commit `feat(bulk-editor): right-click menu with delete`. Open the PR with the scratch-database counts.

---

## Part 3: PR B, Insert record below (from fresh `origin/main` after PR A merges)

**Files:** `src/lib/bulk-editor/drafts.ts`, `src/lib/bulk-editor/__tests__/drafts.test.ts`, `bulk-editor.tsx`, `e2e/bulk-editor-row-menu.spec.ts`

### Task 6: Anchored, prefilled drafts (pure)

**Interfaces:**
- `DraftRow` gains `insertAfter?: string` (the key of the row it sits below) and `prefilled?: true` (nothing of its own has been chosen or typed yet).
- Produces, in `drafts.ts`:
  ```ts
  export function insertionDraft(key: string, source: SheetRow, view: SheetView, sourceDraft?: DraftRow): DraftRow;
  export function orderRows(saved: ReadonlyArray<SheetRow>, drafts: ReadonlyArray<{ row: SheetRow; after?: string }>): SheetRow[];
  ```
- Changes: `isBlank` treats a `prefilled` draft with no edits and nothing pending as blank; `withBrand`, `withLabel` and `withCategory` drop `prefilled` when they change something.

- [ ] **Step 1: Write the failing tests** in `drafts.test.ts`, with the file's existing `label(...)` and `draft(...)` helpers:
  - `insertionDraft` from a saved row in Both view: brand is `{ kind: "existing", id: 10, name: "Four Roses" }`, label is the row's existing label, `categoryId` is the label's, `insertAfter` is the source key, `prefilled` is true.
  - same in Labels-only view: brand set, `label` null, `categoryId` null.
  - from a draft source (`sourceDraft` given): copies that draft's brand, label and category picks, new picks included.
  - `isBlank(prefilledDraft, {})` is true; false once `edits` has a key for it; false once `hasPending` is true; false after `withCategory` or `withLabel` changes it (`prefilled` gone).
  - `orderRows([A, B, C], [{ row: d1, after: "B" }])` is `[A, B, d1, C]`; two drafts after the same anchor, created in order d1 then d2, give `[A, B, d2, d1, C]`; a draft anchored on another draft (`after: d1.key`) lands directly below it; an anchor that is not in `saved` puts the draft at the end, before an unanchored blank row; drafts with no `after` keep their order after all saved rows.
- [ ] **Step 2:** `npx vitest run src/lib/bulk-editor/__tests__/drafts.test.ts`; expect FAIL on the new cases only.
- [ ] **Step 3:** Implement. `orderRows` places drafts in creation order, each directly after its anchor, so the newest is nearest it.
- [ ] **Step 4:** Same command; expect PASS (existing cases unchanged). `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(bulk-editor): drafts that sit below another row`.

### Task 7: Wire Insert record below

**Interfaces:**
- Consumes: Task 6's functions; `rowsFor`, `withBlankRow`, `nextDraftKey`, `keyFloor`, `place`, `focusAfter`, `editorIn`, `valueAt` in `bulk-editor.tsx`; `RowMenuContent` handler map from Task 4.

- [ ] **Step 1: Write the failing e2e** in `e2e/bulk-editor-row-menu.spec.ts`:
  - `Insert record below puts a new row directly under the clicked one, with its brand and label`.
  - `Insert in Labels-only view fills only the brand`.
  - `an inserted row the person never types in is not saved`: insert, click another cell, wait for the sheet's status to settle, reload; the bottle count for that label is unchanged and no "not saved" status was shown.
  - `typing a value in the inserted row saves a new bottle of that label`.
  - `inserting twice under the same row stacks the newest nearest it`.
  - `the inserted row keeps its place while sorted by a column, and takes its sorted place after a reload`.
- [ ] **Step 2:** Run the spec; expect the new cases FAIL.
- [ ] **Step 3:** Implement. `rowsFor` builds the draft rows as today, pairs each with its draft's `insertAfter` by key, and returns `orderRows(savedRows, pairs)`. `insertBelow(rowKey)` creates the draft with `insertionDraft(nextDraftKey(drafts, keyFloor), ...)`, appends it to `drafts`, builds `nextRows = rowsFor(withBlankRow([...drafts, draft], keyFloor))` as the existing code at the `settledDrafts` step does, and places the cursor at the new row's first column for which `editorIn(nextRows, pos)` is non-null and the value is empty (fallback: the Label column), setting `focusAfter.current = true`. Add the `insert` handler to the menu.
- [ ] **Step 5:** Re-run the spec and `npx vitest run src/lib/bulk-editor`; then the full `e2e/bulk-editor.spec.ts` against the Task 3 baseline (pasting new rows and the blank row must behave as before, since they use no anchor). `npm run typecheck && npm run lint`. Commit `feat(bulk-editor): Insert record below`. Open the PR with the scratch-database counts.

---

## Plans still to write

1. **Duplicate bottle and Duplicate label** (after Task 1 reports).
2. **Expand record**: saved rows first, then new rows (after Task 1 reports).
