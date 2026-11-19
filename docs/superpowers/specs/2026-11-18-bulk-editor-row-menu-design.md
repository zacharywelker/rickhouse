# Bulk editor: a right-click menu on every row, and Expand record

**Status: approved by the owner, 2026-11-18.**

Follows the bulk editor (#308, built) and the one-value editing work (#362 to #371). The owner asked whether the browser's right-click menu could be replaced. Nothing in the sheet handles right-click today.

## Why

The sheet is good for typing many rows and poor for finishing one. Today a new row with a brand and a label name but no category cannot be saved: `draftNeeds` in `lib/bulk-editor/save.ts` blocks it with "Needs a category", and the row exists only in the sheet's memory. The only way out is to go back to the cell and keep typing. The owner wants to open that row in the app's own forms, finish it there, and come back to the sheet.

The owner also wants the row actions Airtable puts in its right-click menu (add a record, copy a record, open it, delete it), because they are faster than hunting for a button.

## What the owner wants, in short

- Right-click on a row shows an app menu, not the browser's.
- **Expand record opens the app's real label and bottle forms in a popup**, not a copy of them. The owner plans to redesign those forms after the bulk editor is fixed, and the popup must follow that redesign without extra work.
- Expand record works on a row that is **not saved yet**, so a half-typed row can be finished.
- Which form opens follows the sheet's view toggle: only **Bottles** on gives the bottle form, only **Labels** on gives the label form, both on gives the label form followed by the bottle form.

## The menu

| Item | What it does |
|---|---|
| Expand record | Opens the popup described below. |
| Insert record below | A real positional insert: a new row appears directly below the clicked one and takes its context from it (see "Insert record below"). |
| Duplicate bottle | Opens the app's existing duplicate-bottle page (`/bottles/new?duplicate=ID`) in the popup. Rating and tasting history are not copied (the owner's rule; the builder confirms the existing page already leaves the rating out). |
| Duplicate label | Opens the New Label form in the popup, filled from the source label. Copies the label's fields and its distillery, mashbill, finish and ingredient links. Never copies its bottles (the owner's rule). Photos and COLA approvals are not copied (my call: they are files and records tied to the original). The name is left for the owner to change (my call: a second label with the same brand and name is probably rejected; the builder checks the constraint). |
| Delete label | The existing delete dialog from `delete-bar.tsx`, which asks the server what will be removed and names the bottle count. |
| Delete bottle | The same dialog, for the bottle only. |

Groups, in order: Expand and Insert; the two Duplicates; the two Deletes. A separator between groups, destructive items in the error colour.

Rows that cannot use an item keep it, dimmed, so the menu keeps its shape:

- A label with no bottle: Duplicate bottle and Delete bottle are dimmed. Delete label shows no bottle count.
- A new, unsaved row: both Duplicates are dimmed, Expand record works, and the two Deletes become one item, "Discard new row" (my proposal, since there is nothing on the server to delete).
- In the Bottles-only view the Label items act on the bottle's label, as in the existing delete dialog.

The menu acts on the row that was clicked. Right-clicking a cell moves the cursor to it first. Rows ticked for the delete bar are not touched (my call: a menu item named "Delete label" should not remove several).

It also opens from the keyboard (the Menu key and Shift+F10) on the cursor's row, and closing it returns focus to that cell.

## Expand record

One menu item, one popup. What it opens:

| Sheet shows | Saved row | New row |
|---|---|---|
| Labels | The label's edit page (`/expressions/[id]/edit`) | The New Label form (`/expressions/new`), filled from the row |
| Bottles | The bottle's edit page (`/bottles/[id]/edit`) | If the row's label already exists: the add-bottle form for that label. Otherwise the item is dimmed with "Choose a label first". |
| Both | The label edit page, then the bottle edit page | The search-first Add bottle page (`/bottles/add`): a new label and its bottle in one save |

Rules:

1. **The popup is the real page.** It renders the existing route, so a redesign of those pages shows up in the popup with no change here. The pages must stay embeddable: no assumptions about full-page chrome, and no navigation after save that the popup cannot override.
2. **Typed values travel into the form.** For a new row, every cell the person has typed is carried into the form, mapped with the same function the saver uses (`serverFields` in `lib/bulk-editor/save.ts`), so the form and the sheet agree on what a cell means. How the values reach the form is the builder's call (a long URL is a bad carrier: notes can be long).
3. **A saved row with unsaved sheet edits saves them first**, with the sheet's existing row saver. If that fails, the popup does not open and the failure shows on the cell as it does today. The popup reads the database, so opening it over unsaved cells would show stale values, and saving there would clash with the cells still pending.
4. **Both view, saved row: two steps.** "Label" then "Bottle", each form saving itself, a Next button between them. A label with no bottle has only the first step. This stepper is the only new UI in the feature: no existing page chains the two edit forms.
5. **Both view, new row: one step.** `/bottles/add` already saves a new label and its bottle in one transaction (`catalogBottleAction`). It is embedded directly, whatever the `searchFirstAdd` preference says, because the usual Add bottle form cannot create a label.
6. **After a save in the popup**, the popup closes, the sheet refreshes, and the saved row is flashed with the sheet's existing flash. A new row's draft is removed once the server has the real row, as it is today when a draft saves.
7. **Closing with entries not yet saved asks first.**
8. **Frame:** a large dialog that scrolls (`ui/dialog.tsx`), not a side sheet. The label form is long and a narrow panel would squeeze it. (My call.)

## Approaches considered

- **A custom form in the popup.** Rejected by the owner: it would be a second copy of the label and bottle forms and would drift from them.
- **An iframe of the existing pages.** Cheap, and it follows redesigns, but it gives the popup a second set of page chrome and no way to tell the sheet "saved, refresh".
- **Render the real routes in a dialog with Next's intercepting routes (a parallel `@modal` slot).** The standard way to show a route over another page; a reload shows the full page. **Chosen**, with the one doubt that interception may not catch a page that redirects (`/bottles/new` redirects to `/bottles/add` when the preference is on). That is why the table above names the final pages directly, and why the first step of the build is a throwaway test of interception.

## Goals

- Right-click replaces the browser menu on rows, and nowhere else (the find bar, panels and inputs keep the browser's).
- A half-typed row can be finished in the real forms and comes back as a saved row.
- Redesigning the label and bottle forms later needs no change to the bulk editor beyond what those pages themselves need.

## Non-goals

- Redesigning the label or bottle forms (a later project).
- Sharing a bottle or label with other people (written down as an idea for later; no "Send record" item).
- An "Add notes" item: notes is already a column in the sheet.
- iOS. This is the web bulk editor only.

## Anti-goals

Failures even if it "works": a popup that shows or saves different data from the sheet; typed values lost on the way into or out of the popup; a row saved twice; Delete label removing bottles without saying how many.

## Constraints

- Square corners, paper and ink, the flat offset shadow (DESIGN.md). The menu follows the app's confirm convention for anything destructive: the existing dialog, with the count from the server.
- The app has Radix dialog, popover and checkbox but no menu component. Adding `@radix-ui/react-context-menu` is my call: it gives arrow-key movement, typeahead and the ARIA menu role, which a hand-built menu would have to reproduce.
- The sheet's unsaved-changes leave warning (`bulk-editor.tsx`, the `onLinkClick` handler) must still ask before the popup navigates to a page.
- CI does not run the database-backed suites or Playwright, so the PRs show a run against a scratch database with counts.

## Insert record below

The owner's decision: a true positional insert, because the new row is usually about the row next to it.

- **Where it appears.** Directly below the clicked row, in whatever sort and filters are on. The draft remembers which row it was inserted after, and stays there for the session, the way an edited row already stays in place (`sortRows` places a row by the values it had at load, so an edit does not make it jump). The always-present empty row at the end stays; an inserted draft is an extra row, not that one. If the row it was inserted after is deleted or filtered out, the draft goes to the end.
- **What it starts with** (my call: copy from the clicked row, the one above the new row). In Bottles and Both views: the same brand and label, so the common case is one more bottle of that label. In Labels-only view: the same brand, for another label of it. The cursor lands on the first cell still empty. If the neighbour below is the better reference, changing the Brand or Label cell is the same as on any new row.
- **After a save or a reload** the row takes the sheet's normal place. The sheet has no manual order: rows follow the shelf order (brand, label, bottle) or the active sort. A new bottle of a label therefore ends up in that label's group, and a new label in its alphabetical place under the brand. "Below" is exact for the session and approximate afterwards; the menu does not promise more.
- **Cost.** Drafts are kept in order at the end today (`withBlankRow` in `lib/bulk-editor/drafts.ts`, the `allDrafts` list in `bulk-editor.tsx`), so the rows list, keyboard movement and pasting new rows all need to understand a draft with an anchor. Contained in the sheet's row assembly, but not a one-line change.

## Left to the builder

- How typed values reach the form, and which forms accept which initial values (`ExpressionForm`, `BottleForm` and `CatalogBottle` all take initial values today, but the builder checks each field).
- The "post-save" mode for the forms (`router.push` at `expression-form.tsx:698` today).
- The stepper's look.
- Whether the Duplicate label name collision is a real constraint.

## Build order

1. A throwaway test that a route renders in a dialog over `/bulk-editor`, including the redirect case. Decides the mechanism.
2. The menu, Delete label, Delete bottle, and the Insert item once its question is answered.
3. Duplicate bottle and Duplicate label.
4. Expand record, the largest piece: saved rows first, then new rows.

Each step is its own PR from a fresh `origin/main`.

## Mechanism test result (2026-11-18, throwaway branch, deleted)

Built a `@modal` slot under `/bulk-editor` with intercepting routes (`(...)expressions/[id]/edit`, `(...)bottles/new`, `(...)bottles/add`), each rendering the real page's default export inside the `ui/dialog` component. Driven with Playwright against `next dev` and a scratch database.

1. **A plain route works.** Soft-navigating to `/expressions/1/edit` shows the real edit form in a dialog over the live sheet. The sheet stays mounted (a ticked row and a page-level marker both survived the open and the close), and Escape goes back to `/bulk-editor` with the sheet state intact. A hard load of the same URL shows the full page with no dialog. Radix marks the sheet `aria-hidden` while the dialog is open, so role queries cannot see it; Playwright specs must use a CSS selector for anything behind the dialog.
2. **A redirecting route does not work.** With the `searchFirstAdd` preference on, `/bottles/new` redirects to `/bottles/add` and the page leaves the sheet entirely (no dialog, sheet unmounted). As assumed above, the popup must name the final pages directly and never go through `/bottles/new`.
3. **`/bottles/add` works when named directly.** `/bottles/add?expression=1` is intercepted, the dialog shows the search-first page with the label already chosen, and the sheet stays mounted.
4. **Saving inside the dialog leaves the sheet.** The label form's own `router.push` (`expression-form.tsx:698`) goes to the label page (`/expressions/1` in the test), which closes the dialog and replaces the sheet. The forms need a "saved inside a popup" mode that closes the dialog and refreshes the sheet instead. Same for the bottle and add-bottle forms; the Expand plan lists each push.

Consequence for the Expand plan: the mechanism is sound; the work is the post-save mode in each form, the prefill, and the pending-edits rule.
