# Bulk editor: the sheet is the whole page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bulk editor page runs edge to edge with the nav, the sheet fills the window, and the Details pane lies over the right edge of the sheet instead of taking a column.

**Architecture:** `bulk-editor` moves into a new `(wide)` route group whose layout renders the existing signed-in shell with a `wide` option (no `max-w-page` on the nav or `main`). Inside `BulkEditor`, the rail aside becomes an absolutely positioned overlay in the sheet's frame, the sheet's frame takes the height the page layout leaves it, and the help paragraph becomes a one-line footer with the full text behind "All shortcuts".

**Tech Stack:** Next.js 16 App Router (route groups), React 19, Tailwind v4, Playwright (`e2e/`), vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-bulk-editor-full-page-design.md` (approved 2026-11-18). Mockup screenshots: `docs/superpowers/specs/assets/bulk-editor-full-page-*.png`.

## Global Constraints

- Rail behaviour is unchanged: it shows the row of the selected cell, is display only, is not a live region, is open from 1280px wide until the person chooses, and the choice is remembered under `bulk-editor:rail`. Its contents are untouched.
- Below `md` (768px) nothing changes: no pane, the page scrolls as before, the long help paragraph shows.
- The pane is separated from the sheet by a hairline and the flat shadow `-2px 0 0 rgb(20 33 61 / 0.12)`. No blur, glass, gradients or rounded cards.
- Opening or closing the pane never changes a column's width and never moves a row.
- The sheet keeps a minimum height of `min-h-80` (320px); a shorter window scrolls the page.
- URLs do not change. Other pages keep `max-w-page`.
- One branch `claude/bulk-editor-full-page` from fresh `origin/main` (`git fetch origin` first), one PR, one commit per task. Verify against a scratch database whose name contains `test`, started the way `docs/bulk-editor-verification` and the existing specs do (`assertThrowawayDatabase()`), on a port that is free (`ss -ltnp | grep <port>` first: another session may own 1965).
- The Playwright suite and DB-backed suites do not run in CI: run them locally and put the counts in the PR.

## Review Focus

1. Several column widths in `bulk-editor:widths` (from #373) plus the pane open: the last column still scrolls fully clear of the pane (Task 3).
2. The toolbar wrapping to two rows at 1100px: the sheet loses a row of height instead of the page overflowing (Task 2).
3. Ticking a row shows the Delete bar: it must not change the sheet's height or sit under the pane, and the `fixed` save/undo notices must stay above the pane and clickable with it open (Task 3).
4. A short window (1280×500) scrolls the page, the sheet is at least 320px tall, and the footer is reachable (Task 2).
5. At 700px wide the page is exactly as before: no pane, no footer, the long paragraph (Task 4).

## File structure

- Create `src/components/app-shell.tsx`: the signed-in shell (session, preferences, nav, `main`), with `wide`.
- Create `src/app/(wide)/layout.tsx`; move `src/app/(app)/bulk-editor/{page.tsx,actions.ts}` to `src/app/(wide)/bulk-editor/`.
- Modify `src/app/(app)/layout.tsx` (use `AppShell`), `src/components/app-nav.tsx` (`wide`), `src/components/bulk-editor/bulk-editor.tsx` (layout, pane, footer).
- Create `src/components/bulk-editor/shortcuts.tsx`: the "All shortcuts" control and the help text.
- Create `e2e/bulk-editor-full-page.spec.ts`. Same `beforeAll`/`beforeEach` as `e2e/bulk-editor.spec.ts` (reset, seed the tournament field, sign in, go to `/bulk-editor`).
- Update the six `@/app/(app)/bulk-editor/actions` imports: `links-editor.tsx`, `use-row-saver.ts`, `delete-bar.tsx`, `panel-editor.tsx`, `bulk-editor.tsx`, `src/lib/bulk-editor/__tests__/rows.integration.test.ts`.

---

### Task 1: A wide route and shell

**Files:** as listed above (shell, `(wide)` layout, `app-nav.tsx`, move, six imports); Test: `e2e/bulk-editor-full-page.spec.ts`.

**Interfaces:**
- Produces: `AppShell({ children, wide }: { children: React.ReactNode; wide?: boolean }): Promise<React.JSX.Element>` (async server component; the body of today's `AppLayout`, with `main` using `max-w-page` unless `wide`); `AppNav({ signOut, userMenu, wide }: { signOut: React.ReactNode; userMenu: React.ReactNode; wide?: boolean })` which drops `max-w-page` from the header container (`app-nav.tsx:109`) and the menu panel (`:146`) when `wide`.

- [ ] **Step 1: Write the failing test** `"the page and the nav run edge to edge, other pages stay capped"` at 1920×1080: on `/bulk-editor` the grid's frame right edge is within 32px of 1920 and the nav's logo link `x` is at most 32; on `/bottles` the `main`'s content box is at most 1440px wide.
- [ ] **Step 2: Run it** (`E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/bulk-editor-full-page.spec.ts --trace off`). Expected: FAIL on the first assertion.
- [ ] **Step 3: Extract `AppShell`**, make `(app)/layout.tsx` return `<AppShell>{children}</AppShell>`, add `(wide)/layout.tsx` returning `<AppShell wide>{children}</AppShell>`, add `wide` to `AppNav`. For `wide`, `main` is `flex min-h-0 w-full flex-1 flex-col px-4 py-4 sm:px-6` (no `max-w-page`, no `mx-auto`).
- [ ] **Step 4: Move the route** with `git mv` and fix the six imports. `npx tsc --noEmit` shows only the one error in `src/lib/expressions/label-patch-body.ts` that is already on `main`.
- [ ] **Step 5: Run the test** (PASS) and `npx eslint` on the touched files.
- [ ] **Step 6: Commit** `Bulk editor: its own wide layout`.

### Task 2: The sheet fills the window

**Files:** Modify `src/components/bulk-editor/bulk-editor.tsx` (the root returned at about line 1778 and the `className` at about line 1779), `src/app/(wide)/bulk-editor/page.tsx`, `src/components/app-shell.tsx`; Test: same spec.

**Interfaces:**
- Consumes: Task 1's `wide` `main`.
- Produces: `BulkEditor` renders the page's only `<h1>Bulk editor</h1>` (`text-3xl text-accent`, `w-full md:w-auto` so it sits in the toolbar row from `md` up and above it below `md`); `page.tsx` no longer renders one.

- [ ] **Step 1: Write the failing tests.** (a) At 1920×1080: `document.documentElement.scrollHeight <= 1080`, and the grid's scroll box (the `.overflow-x-auto` ancestor of the grid) bottom is within 48px of 1080. (b) At 1280×500: the page scrolls (`scrollHeight > 500`) and the scroll box is at least 320px tall. (c) At 1100×800 with the toolbar forced to wrap (add a filter so a chip row shows): the document does not scroll.
- [ ] **Step 2: Run them.** Expected: FAIL (the box is capped by `calc(100dvh-19.5rem)` today).
- [ ] **Step 3: Restructure the root.** In `AppShell`'s wide case the container is `flex min-h-dvh flex-col md:h-dvh`. `BulkEditor`'s root (the `sheetRef` element, keeps the `--cw-*` style) becomes a flex column that is `md:min-h-0 md:flex-1`; its children are the toolbar row (today's toolbar contents with the `<h1>`, no border, no background), the frame (`relative flex min-h-80 flex-col border border-border bg-card md:flex-1`, holding the existing `<Table>` and no longer the toolbar), then the rest as today. The scroll box (`.overflow-x-auto` the `Table` renders) is `md:min-h-0 md:flex-1 md:overflow-y-auto`; delete the `max-h-[calc(100dvh-19.5rem)]` and `min-h-80` rules on it. Keep `scroll-pl` and `scroll-pt-16` on it.
- [ ] **Step 4: Run the tests** (PASS); run the whole `e2e/bulk-editor.spec.ts` (it sets 1100×800 and 1280×560 viewports) and fix any spec that assumed the old height by checking what it asserts, not by loosening it.
- [ ] **Step 5: Commit** `Bulk editor: the sheet fills the window`.

### Task 3: The pane lies over the sheet

**Files:** Modify `bulk-editor.tsx` (the `<aside data-bulk-editor-panel>` at about line 2028 and its tab button, the frame from Task 2, and where `<DeleteBar>` is rendered at about line 1997) and `src/components/bulk-editor/delete-bar.tsx`; Test: same spec.

**Interfaces:**
- Consumes: `useRail()` and `RailContent` unchanged.
- Produces: the aside moves inside the frame as `absolute inset-y-0 right-0 z-10 hidden w-72 border-l border-foreground bg-card shadow-[-2px_0_0_rgb(20_33_61/0.12)] md:block`, keeping `data-bulk-editor-panel`, `aria-label="Row details"` and today's open/closed/auto classes (`railChoice === null ? "hidden xl:block" : …`). The show-tab button is absolutely positioned at the frame's top right.

- [ ] **Step 1: Write the failing tests** at 1366×768 (the default columns overflow): (a) the pane's right edge equals the frame's right edge, and the grid's width is the same with the pane open as closed (`boundingBox().width`), as is the `Brand` header's width (toggle with the "Hide the details panel" button). (b) Scroll the scroll box to its maximum `scrollLeft`: the last header cell's right edge is at most the pane's left edge when the pane is open, and at most the frame's right edge when closed. (c) Focus a cell in the last column by pressing End on the first row: the cell is fully left of the pane. (d) Set two widths through `localStorage["bulk-editor:widths"]`, reload, and repeat (b). (e) A save notice (type a value in a Price cell) is above the pane: `elementFromPoint` at the notice's centre is inside `[data-notice]`.
- [ ] **Step 2: Run them.** Expected: FAIL (the aside is a sibling that shrinks the sheet).
- [ ] **Step 3: Implement** the overlay as above. While the pane is open the scroll box gets trailing space equal to the pane width and `scroll-pr` equal to it (`w-72`), in the same state the aside is shown (use the same three-way condition as the aside; CSS only, so the server and browser agree). First try `padding-right` on the scroll box; if test (b) fails in Chromium, use an `aria-hidden` spacer after the table instead. Do not change any column width.
- [ ] **Step 4: Move the Delete bar** (`delete-bar.tsx:52`, today `sticky bottom-4` in the page flow) from md up to an overlay inside the frame: `md:absolute md:bottom-4 md:left-4 md:right-[19rem] md:z-10` (`19rem` is the pane's `w-72` plus 1rem), so ticking a row neither shrinks the sheet nor puts the bar under the pane; below `md` it stays as it is. Add test (f): tick a row, the frame's height is unchanged and the bar's right edge is at most the pane's left edge.
- [ ] **Step 5: Run the tests** (PASS), then the existing rail and delete specs in `e2e/bulk-editor.spec.ts`.
- [ ] **Step 6: Commit** `Bulk editor: the Details pane lies over the sheet`.

### Task 4: Footer and "All shortcuts"

**Files:** Create `src/components/bulk-editor/shortcuts.tsx`; Modify `bulk-editor.tsx` (the help `<p>` at about line 1990); Test: same spec.

**Interfaces:**
- Produces: `Shortcuts(): React.JSX.Element` containing the full existing help text, word for word (moved, not rewritten, including the platform-dependent Ctrl/Cmd+Z wording); and `ShortcutsFooter(): React.JSX.Element`, a one-line `md:flex hidden` bar with the basics ("Arrow keys move. Type or press Enter to edit.", Tab, Esc, Undo, Alt+Shift+Left or Right to resize) and an "All shortcuts" button that opens `Shortcuts` in the project's `Popover`. Below `md` the full text shows under the sheet as today and the footer is hidden.

- [ ] **Step 1: Write the failing tests.** At 1366×768: the footer is one line (its height under 40px) and shows "All shortcuts"; clicking it shows text containing "Ctrl+Enter creates what you typed" (use the platform's own wording: assert on `Enter creates` only). At 700×900: the footer is not visible and the long text is visible without a click.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** both components and swap the paragraph. The footer sits below the frame, inside the page padding.
- [ ] **Step 4: Run the tests** (PASS).
- [ ] **Step 5: Commit** `Bulk editor: a one-line footer, with all shortcuts a click away`.

### Task 5: Verify and open the PR

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint src e2e`, `npx vitest run` (counts in the PR), the whole Playwright suite against the scratch database.
- [ ] **Step 2:** Screenshot `/bulk-editor` at 1920×1080 with the pane open and closed and at 1366×768, and compare with `assets/bulk-editor-full-page-*.png`; say in the PR where it differs.
- [ ] **Step 3:** Push and open one PR "Bulk editor: the sheet is the whole page (#359 item 1)" that mirrors the repository's PR style, listing what ran and what did not.

## Self-review (spec coverage)

Route group, shell, nav: Task 1. Window-height layout, short-window scroll, title in the toolbar row: Task 2. Overlay pane, trailing space and scroll padding, hairline and offset shadow, tab, toggling never changes widths: Task 3. Footer, "All shortcuts" with the unchanged text, below-`md` unchanged: Task 4. The spec's builder items are decided: the notices are `fixed` to the viewport (`bulk-editor.tsx:1999`) so they take no layout space and stay above the pane (Task 3e); the Delete bar is `sticky` in the flow today (`delete-bar.tsx:52`), so Task 3 makes it an overlay in the frame so it cannot shrink the sheet.
