# Bulk editor: the sheet is the whole page, the Details pane lies over it

**Status: awaiting the owner's approval.** The owner approved the mockup below on 2026-11-18 ("this is what I want"); this document writes it down so it can be planned.

Follows #308 and item 1 of the owner's first round of real use (#359). It changes how the page is laid out. It does not change what the sheet or the pane contain.

## Why

The owner's words: the page *is* the bulk editor; the Details pane is there to accompany it, so it should look like an overlay that goes over the editor, not a sibling box that takes a column from it. This page should "feel different and larger than the rest."

Today the page is a 1440px column (`max-w-page`) with side padding, a title above a boxed sheet, and a second box (the rail) beside it. On a wide monitor that leaves wide empty margins, and the rail permanently takes about 290px from the sheet.

## What the owner wants

- The **sheet and the nav run edge to edge** on this page.
- The **Details pane lies over the right edge of the sheet** and keeps behaving exactly as the rail does today: it shows the row of the selected cell and changes as the selection moves. (The owner asked for existing functionality to be kept.)
- It looks like **the mockup**: `assets/bulk-editor-full-page-wide.png` (1920, pane open), `-hidden.png` (pane hidden), `-laptop.png` (1366), `-today.png` (for comparison).

## Goals, non-goals, anti-goals

**Goals**
- The sheet is the page: full width, and as tall as the window leaves it.
- The pane never takes width from the sheet, and opening or closing it never changes a column's width or moves a row.
- The selected cell is never hidden under the pane.

**Non-goals**
- Anything else in #359 (items 2 to 11), including which columns exist.
- What the pane shows, or how its contents are chosen.
- Other pages' width or the nav on other pages.
- Phones and small tablets (below `md`): unchanged. The rail does not exist there today.

**Anti-goals** (a failure even if it technically works)
- The page scrolling sideways, or the sheet jumping when the pane is toggled.
- The pane covering the cell being edited.
- Glass, blur, large soft shadows or rounded cards (DESIGN-TOKENS §1, §20): the pane is separated by a hairline and the app's flat offset shadow only.

## Constraints

- The nav and the page width are set in `src/app/(app)/layout.tsx` and `src/components/app-nav.tsx:109`, both `max-w-page`. A page cannot widen itself out of them with CSS alone (see Approaches).
- The sheet already scrolls inside its own box from `md` up (`bulk-editor.tsx:1779`, a `calc(100dvh-19.5rem)` height cap) and holds scroll padding clear of the frozen Brand and Label columns (`scroll-pl-[calc(var(--cw-brand…)…)]`). The same mechanism has to keep the cell clear of the pane.
- The rail's existing rules stay: open by default from 1280px wide until the person chooses, the choice remembered in the browser, display only, not a live region, a click in it is not a click away from the sheet (`bulk-editor.tsx:73`, `2020-2037`).

## Approaches

1. **A route group with its own layout (chosen).** Move `bulk-editor` out of `(app)` into a new `(wide)` group. Pull the signed-in shell out of `(app)/layout.tsx` into a shared `AppShell` component with a `wide` option; `(app)/layout.tsx` and `(wide)/layout.tsx` both render it. `AppNav` gets a `wide` option that drops its `max-w-page`. URLs do not change (groups are not part of the path). Cost: moving two files and updating six import paths. Why: the width is a property of the layout, so it belongs there, and nothing else is affected.
2. **A CSS override from inside the page** (for example `body:has([data-wide])` removing `max-w-page`). No file moves, but a page reaches up and rewrites its parent's layout from a distance, and the next person to touch the layout will not find it. Rejected.
3. **A negative-margin breakout inside the existing column** (`w-screen` with a calc margin). The nav stays centred in 1440px, so it would not line up with the sheet, and `100vw` includes the scrollbar, which adds a horizontal scroll. Rejected.

## The design

*Decided by the owner by approving the mockup, except where marked **my call**.*

**Layout.** On `md` and up the page is the window: nav, toolbar row, sheet (fills what is left), footer. The sheet is the only thing that scrolls. The `calc(100dvh-19.5rem)` cap goes; the sheet takes the remaining height from the layout, so a toolbar that wraps to a second row costs the sheet a row of height instead of overflowing the window. Below `md` nothing changes.

**Short windows.** **My call:** the sheet keeps a minimum height (the existing `min-h-80`). When the window is shorter than nav + toolbar + that minimum + footer (a small laptop, or browser zoom at 200%), the page itself scrolls. A layout locked to the window with no escape would leave a sliver of sheet in those cases.

**Nav.** On this page it spans the full width, with its left edge at the same 24px as the sheet. On other pages it is unchanged.

**Title and toolbar.** **My call, seen in the mockup:** at `md` and up the "Bulk editor" title sits at the left of the toolbar row instead of above it. The toolbar contents and the Find controls are unchanged. Below `md` the title stays above.

**The pane.** A panel lying over the right edge of the sheet's frame, full height of the sheet, about 288px wide (today's `w-72`), separated from the sheet by a hairline and the flat offset shadow `-2px 0 0 rgb(20 33 61 / 0.12)` (the same offset-shadow language as the photo frame). Its contents, header ("Details" with the hide control) and behaviour are today's, unchanged. Hidden, it leaves a slim tab at the right edge of the sheet (`aria-expanded`), as today.

**Never under the pane.** While the pane is open, the sheet's scrolling content has trailing space on the right equal to the pane's width, so the last column can scroll fully clear, and the scroll box's right scroll padding is the pane's width, so arrowing or clicking to a cell scrolls it clear of the pane. Hiding the pane removes both. Neither changes a column's width, so toggling never moves anything.

**Help text.** **My call, seen in the mockup:** at `md` and up the long help paragraph under the sheet becomes a one-line footer (the basics and the Alt+Shift+arrow resize shortcut) with an "All shortcuts" control that shows the full existing text, word for word. Nothing is removed from the text.

## What is left to the builder

- The pane's exact width and the tab's exact position and size.
- Whether "All shortcuts" is a popover or a dialog (the project has a popover already).
- Where the save and undo notices sit now that the sheet is taller. They stay inside the sheet's frame; the pane must not cover them.
- Whether the Delete bar and Find chips need space reserved so the sheet does not jump when they appear.

## How it is checked

- Playwright at 1920×1080, 1366×768 and a short window (for example 1280×600): the sheet's left and right edges meet the window's, the pane covers no more than its own width, and arrowing to every column leaves the selected cell clear of the pane.
- Toggling the pane leaves every column's width and every row's position unchanged (compare boxes before and after).
- The page does not scroll at 1920×1080 and does scroll at the short size.
- Below `md`: the page is as before.
- A screenshot at 1920 beside `assets/bulk-editor-full-page-wide.png`.
- The Playwright suite and the DB-backed suites do not run in CI; run them against a scratch database and put the counts in the PR.

## Facts this relies on, and where they were read

- `src/app/(app)/layout.tsx`: `main` is `mx-auto w-full max-w-page px-4 py-6 sm:px-6`; the nav is rendered above it.
- `src/components/app-nav.tsx:109`: the nav's inner container is `max-w-page` too.
- `--container-page: 1440px` in `src/app/globals.css`.
- `src/app/(app)/bulk-editor/page.tsx`: the page is a server component that renders the title and `BulkEditor`; the toolbar is inside `BulkEditor`, so the title moves into it or is passed in.
- Imports of `@/app/(app)/bulk-editor/actions` in `links-editor.tsx`, `use-row-saver.ts`, `delete-bar.tsx`, `panel-editor.tsx`, `bulk-editor.tsx` and `src/lib/bulk-editor/__tests__/rows.integration.test.ts` change with the move.
- Not read: the notices and Delete bar placement (builder item above), and whether any e2e spec depends on the old page height.
