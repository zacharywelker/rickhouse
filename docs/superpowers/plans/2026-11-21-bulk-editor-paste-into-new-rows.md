# Bulk editor: pasting into a new row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paste fills the new row it lands on (typed, inserted, or the empty row at the bottom) instead of adding a separate new row at the bottom.

**Architecture:** A pure function decides, for each pasted row, whether it lands on a saved row (written as today), on an existing new row (filled in place), or past the end (a new row). The sheet's `makeNewRows` becomes `fillNewRows`, which takes the draft each pasted row lands on and applies the same per-cell reading, name matching and `settleDraft` to it, keeping its key, position and stored edits.

**Tech Stack:** Next 16 / React 19, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-bulk-editor-paste-into-new-rows-design.md` (approved 2026-11-21)

**Starting point:** branch `claude/bulk-paste-fill`, cut from `claude/bulk-row-insert` (PR #379, which has Insert and the key fix). Its own PR targets #379.

## Global Constraints

- A paste creates nothing on the server and saves nothing by itself.
- A paste starts at the cursor cell and writes only the cells copied; a blank copied cell leaves what the row has.
- Pasting onto a saved row, a selected block filled with one copied cell over new rows, and list/panel cells in new rows are unchanged.
- At most `MAX_NEW_ROWS` (300) new rows per paste, as now.
- Keys: a filled row keeps its key; keys given to new rows start past every key a paste uses.
- Never `pkill -f`; kill servers by PID. Rebuild `node_modules` with `npm ci` if zod is not 4.x. CI skips Playwright and DB-backed suites: show scratch-database counts in the PR.

## Review Focus

- Keys: filling the empty row and making rows past it, in one paste, with inserted rows above, must give every row its own key (no shared edits). Pinned in Task 3.
- Waiting text: pasting a brand, label or category onto a row that already has text waiting to be chosen for that column replaces the waiting text; it is not kept. Pinned in Task 3.
- Identity: a pasted brand different from the one an inserted row copied clears that row's label and category (as choosing another brand does) and the row stays where it was inserted. Pinned in Task 3.
- Saving: a paste into an inserted row whose brand and label already exist does not create anything until the cursor leaves the row. Pinned in Task 3.
- The unchanged cases: pasting at the empty row still reports "Added N new rows" with the first row at the empty row's place; a paste across saved, new and past-the-end rows does each in order. Pinned in Tasks 2 and 3.

---

### Task 1: Which pasted row lands on what (pure)

**Files:**
- Modify: `src/lib/bulk-editor/paste-rows.ts`, `src/lib/bulk-editor/__tests__/paste-rows.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PasteRoute = { line: number; into: string | null };
  /** For each pasted row that does not land on a saved row, in order: `into` is the key of the new row it lands on, or null when it is past the last row. */
  export function routePasteRows(rows: ReadonlyArray<{ key: string; draft?: unknown }>, atRow: number, count: number): PasteRoute[];
  ```
  `linesForNewRows` stays until Task 3 removes it.

- [ ] **Step 1: Write the failing tests** in `paste-rows.test.ts` (`rows` = saved rows with `draft: undefined`, new rows with `draft: {}` and a `key`): with rows `[s0, s1, d1, s2, s3, d2]` (`d2` the empty row): pasting 4 rows at row 3 gives `[{line:2,into:"d2"},{line:3,into:null}]`; 4 rows at row 0 gives `[{line:2,into:"d1"}]`; 3 rows at row 4 gives `[{line:1,into:"d2"},{line:2,into:null}]`; 2 rows at row 0 over saved rows only gives `[]`; a paste that starts on the last row and has 2 rows gives `[{line:0,into:"d2"},{line:1,into:null}]`.
- [ ] **Step 2:** `npx vitest run src/lib/bulk-editor/__tests__/paste-rows.test.ts`; expect FAIL on the new tests only (`routePasteRows` is not a function).
- [ ] **Step 3:** Implement `routePasteRows` (one pass: `rows[atRow + i]` is saved: skip; has `draft`: `into` its key; missing: `into: null`).
- [ ] **Step 4:** Same command; expect PASS. `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(bulk-editor): which pasted row lands on what`.

### Task 2: `makeNewRows` takes the row each pasted row lands on (no behaviour change)

**Files:**
- Modify: `src/components/bulk-editor/bulk-editor.tsx` (`pasteGrid`, `makeNewRows` near the end of the paste code)

**Interfaces:**
- Consumes: `PasteRoute` (Task 1).
- Produces, in the sheet:
  ```ts
  function fillNewRows(routes: Array<{ cells: string[]; into: string | null }>, startCol: number, today: string, skipped: string[]):
    { made: number; filled: number; cells: number; waiting: number; beyondColumns: number };
  ```
  `made` counts rows that did not exist as new rows before the paste (including the empty row at the bottom becoming one), `filled` counts existing new rows filled, `cells` counts accepted non-blank cells pasted into filled rows, the rest as `makeNewRows` returns today.

- [ ] **Step 1: Baseline.** With a dev server on a scratch database (see memory `bulk-editor-verification-recipe`), run `npx playwright test e2e/bulk-editor.spec.ts -g "paste|Paste|pasted" --trace off`; write down which pass and which fail (the known `:1736` fails on clean `origin/main`; its output is the baseline).
- [ ] **Step 2:** Rename and reshape `makeNewRows` into `fillNewRows` with the signature above, but have `pasteGrid` pass every route with `into: null` (the lines `linesForNewRows` returns today), so nothing changes. Inside, key each row as `into ?? \`d${floor++}\`` and start the base draft from `emptyDraft(key)`; keep the result's `rows` as `made`.
- [ ] **Step 3:** `npm run typecheck && npx eslint src/components/bulk-editor/bulk-editor.tsx`; expect clean.
- [ ] **Step 4:** Re-run Step 1's command; expect exactly the same pass and fail set.
- [ ] **Step 5:** Commit `refactor(bulk-editor): makeNewRows can fill a row it is given`.

### Task 3: Fill the new row a pasted row lands on

**Files:**
- Modify: `src/components/bulk-editor/bulk-editor.tsx`, `src/lib/bulk-editor/paste-rows.ts` (remove `linesForNewRows`), `src/lib/bulk-editor/__tests__/paste-rows.test.ts` (drop its tests)
- Test: `e2e/bulk-editor-paste-into-new-rows.spec.ts` (same `beforeAll`/sign-in as `bulk-editor-row-menu.spec.ts`; the paste helper dispatches a `ClipboardEvent` with a `DataTransfer` on the focused cell, as in `bulk-editor.spec.ts`)

**Interfaces:**
- Consumes: `routePasteRows`, `fillNewRows` (Tasks 1, 2); `settleDraft` (`paste-rows.ts`); `pendKey`, `dropPending`, `setPending`, `setEdits`, `setDrafts`, `setKeyFloor` in the sheet.
- Behaviour of `fillNewRows` when `into` is a key: the base draft is `drafts.find(d => d.key === into)`, or, for the empty row at the bottom (not in `drafts`), `emptyDraft(into)`; the row's stored edits are kept and the pasted typed values are merged over them (`{...edits[key], ...typed}`); waiting text for each column the paste names is dropped before the new waiting text is stored; the result replaces the draft in place (the empty row is appended, which keeps its place); `floor` starts at `max(keyFloor, every into key's number + 1)`.
- `pasteGrid` calls `routePasteRows(rows, at.row, grid.length)`, passes the routes (cells from `grid[line]`, at most `MAX_NEW_ROWS` made) to `fillNewRows`, and builds the notice: `Pasted ${pasted + cells} cells`, and `Added N new rows` from `made` only. A range filled with one copied cell still skips new rows as today.

- [ ] **Step 1: Write the failing e2e specs** (Both view, scratch database seeded by `seedTournamentField`; each uses its own label):
  - `a pasted row fills the inserted row it lands on, which keeps its place and its brand and label`: insert below a bottle row, put the cursor on the inserted row's Price paid cell, paste `45`; that row (not a new one at the bottom) shows the price, still directly below its row, still showing the brand and label; the row count is unchanged; the notice says `Pasted 1 cell`.
  - `a pasted row fills a new row that was typed, and a blank pasted cell leaves what it has`: type a brand and a new label in the empty row, paste `\t\t77` (blank, blank, a value) onto its Brand cell; its brand and label are unchanged and the third column holds 77.
  - `pasting at the empty row still makes new rows, the first at the empty row's place`: paste two rows there; the notice says `Added 2 new rows`, the first lands where the empty row was.
  - `one paste across a saved row, an inserted row and past the end does each in order`: three rows pasted starting on a saved row directly above an inserted one at the bottom of the saved rows: the first writes its saved row's cells, the second fills the inserted row, the third makes a new row at the bottom.
  - `a pasted brand different from the inserted row's clears its label and keeps its place`.
  - `a pasted label that does not exist waits to be chosen on the row it lands on, replacing what was waiting there` (paste one unknown label, then another: the cell shows the second).
  - `a paste into an inserted row whose label exists saves nothing until the cursor leaves it` (database count unchanged after the paste; one more bottle after the cursor leaves).
  - `ten rows pasted at the empty row after two inserts give ten rows with keys of their own` (no row shows another's values).
- [ ] **Step 2:** Start the dev server on the scratch database (`next dev -p 1965`, `E2E_BASE_URL=http://localhost:1965`, `DATABASE_URL` the throwaway one) and run `npx playwright test e2e/bulk-editor-paste-into-new-rows.spec.ts --trace off --timeout 40000`; expect the filling specs to FAIL and the "still makes new rows" spec to pass.
- [ ] **Step 3:** Implement the behaviour above in `pasteGrid` and `fillNewRows`; delete `linesForNewRows` and its tests. `npm run typecheck && npx eslint src e2e`.
- [ ] **Step 4:** Re-run Step 2; expect all PASS.
- [ ] **Step 5:** Regression: `npx playwright test e2e/bulk-editor.spec.ts e2e/bulk-editor-row-menu.spec.ts --trace off --timeout 40000` (detached, poll the output file); expect the same set as the Task 2 baseline (only the known `:1736` may fail), then `npm test`.
- [ ] **Step 6:** Commit `feat(bulk-editor): a paste fills the new row it lands on`. Open the PR (base `claude/bulk-row-insert`) with the counts, once the owner says to.
