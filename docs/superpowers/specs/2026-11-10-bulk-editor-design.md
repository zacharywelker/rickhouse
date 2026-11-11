# Bulk editor (web) — design

Status: draft for review. Laptop web only.

## Why

Entering a 300-bottle collection through the single "add bottle → add label / select label" flow takes too long. It is right for one or two bottles and wrong for a shelf. The same goes for label-wide passes such as adding MSRPs, which today means opening each label's edit page.

The collection tables currently carry an **Edit** toggle (inline edit, row checkboxes, a sticky delete/save bar) and link to separate **Bulk add** pages that only create rows. This replaces all of that with one dedicated editor that feels like Airtable, Baserow or NocoDB: a sheet you type into, that saves as you go.

The person doing this works **shelf by shelf**, picking up one bottle at a time and typing what is on it. Keyboard-first matters more than anything else on this list.

## Goals

- One editor, reached from the collection page, that **edits existing rows and adds new ones** for labels, bottles, or both.
- A fast, keyboard-driven way to enter a whole collection with little back and forth.
- A fast way to make label-wide fixes (MSRP is the motivating one) down one column.
- Bulk delete lives here, with a confirmation.
- The collection tables become **display only**: no Edit toggle, no row checkboxes, no delete/save bar.

## Non-goals

- Import from a spreadsheet. Wanted later as a migration feature; separate from this.
- A shared, moderated label database. Design so a later link to one is not blocked; build nothing for it now.
- Undo. A mistyped cell is retyped.
- Phone or touch layout. The iOS app is for one bottle at a time with the barcode scanner.
- Carry-over of values from the row above. Rejected by the owner. Copying a row stays an explicit action (the existing duplicate-row button).
- Drafts that survive a page reload. Incomplete rows live in the browser until they can save (see "Leaving the page").

## Anti-goals (a failure even if it technically works)

- A typo silently creating a junk label or brand.
- Two rows for the same new label ending up as two labels.
- A label shared by other bottles changing by accident. (Changing it on purpose is a triple-click, and says how many bottles it affects.)
- A grid left open for an hour overwriting edits made elsewhere (the iOS app edits the same rows).
- The tables becoming editable again.

## The sheet

### Rows and columns

- All rows render in one scroll, **not paged**. (The collection tables stay paged.) One row per bottle when Bottles is on; one row per label when only Labels is on. The rows are the same set the collection table lists. *(Spec writer's call; the builder confirms what that set is.)*
- A blank row is always at the bottom, ready for the next entry.
- Two independent toggles, **Labels** and **Bottles**. Either or both; at least one stays on. **Brand** and **Label** are identity columns and always show.
- Column order follows the shelf flow, and matches the single-add forms (label fields first, then bottle fields):
  Brand, Label, **Category**, size, proof/ABV, Cask Strength or Bottled in Bond, age, distillery, mashbill, finish, then single barrel / private selection, then price paid, store, purchase date. The Bottle group also holds **this bottle's own proof, age and size** (see "Locked and overridable cells"), hidden by default.
- Header groups read **Label** and **Bottle** (see Look). Any field today's inline Edit or Bulk add can set must still be settable (status, release, release year, and so on); where each goes is the builder's call.
- The Fields picker and per-browser remembered hidden columns (`ColumnPicker`, `useHiddenColumns`) are reused for column visibility; where the Labels/Bottles toggles are remembered is the builder's call.

### Finding rows

The owner wants search, sort and filters ("the whole shebang"). With 300+ rows in one scroll it is not optional. Floor for the first version: the same search, sort and filters the collection table already has, on the editor's rows, plus a count ("Showing 40 of 312"). Grouping and saved views are **not** in the first version unless the owner asks. *(The owner asked for search, sort and filters, and agreed grouping and saved views can wait.)*

Rules that keep search and filters from fighting the entry flow:

- **Rows you are working on never disappear.** A row entered or edited this session stays visible and in place even if it no longer matches the active filter or sort (type a bourbon while filtered to gin and it stays), until the filter is cleared or the page reloads. Blocked and unsaved rows are always visible.
- The blank entry row stays at the bottom whatever is filtered.
- The rail's "On your shelf" counts use **the whole collection**, never the filtered view.
- Filtering and sorting change what is shown, never what is saved.
- Whether the collection table's current filters carry into the editor ("edit these 40 bottles") is the builder's call; it is a good idea, not agreed.

### Brand, Label, Category

- **Brand** is an autocomplete of existing brands, or a new one. **Label** only offers labels under the chosen brand, or a new one; it stays locked until a brand is chosen. Data fact: a label is `brand + name`, unique per brand; the distillery is a separate link.
- Creating a new brand or label is a **visible option** in the dropdown (*Create "…"*), chosen with Enter. Leaving a cell never creates one.
- A **near-match hint** shows when typed text is close to an existing brand (or, within the brand, an existing label): "did you mean …?" What counts as near is the builder's call (case, spacing, punctuation, small edit distance).
- Tab accepts the highlighted **existing** match; creating something new needs Enter on the *Create* option.
- **Category** is a closed autocomplete ("bou" highlights Bourbon; Tab or Enter accepts). It is typed on every row and is never inferred. It decides which later fields apply; a field that does not apply shows as a dash, as in today's bulk grid.

### Locked and overridable cells

Label fields and bottle fields are **separate columns**, as they are in the single forms. That is what makes "change this bottle" and "change the label" two different, visible things:

- **Bottle group columns change only that bottle.** This includes the bottle's own proof, age and size (the single bottle form's section "This bottle's own proof, age and size"). Left blank, a bottle inherits the label's value, shown in grey in the cell.
- **Label group columns change the label, and so every bottle on it.**
  - Bottles-only view: label fields are read-only, shown greyed, with no unlock.
  - Labels-only view: label fields are editable (a row is a label).
  - Both: a **new** label's fields are editable; an **existing** label's fields are **locked** on bottle rows.
- A locked cell is visibly locked (grey, lock mark, hover text "Triple-click to edit"), using the same convention as the single forms (`locked` / `onUnlock`, `e.detail >= 3`).
- **Triple-click** unlocks it, and the edit then changes the label for all its bottles. While a locked label cell is unlocked and being edited, it says how many bottles it affects ("Changes 3 bottles"), and the rail says the same. This is the one deliberate way to change a shared label from a bottle row. *(The "affects N bottles" notice is the spec writer's addition: saves are immediate and there is no undo.)*
- Triple-click is the only way in, by decision: it is deliberate and cannot be set off by a stray key. **Accepted limitation: a keyboard-only user cannot unlock a cell.**
- **Renaming a label happens only in the Labels-only view.** On a bottle row, the Brand and Label cells choose which label that bottle belongs to: changing them on a saved bottle **moves the bottle to another label** (the app already has move-bottle logic) and never renames the label. *(Confirmed by the owner: on a bottle row the change moves the bottle to a different label; in the Labels view it fixes a misspelling.)*

### Saving

- A row saves as you go, once it has what it needs: for a label, brand, label name and category. Whether a bottle needs more than a label is for the builder to confirm against the bottle schema.
- Existing rows send only the cells that changed.
- A row that cannot save yet shows a **red outline on the cell that is blocking it, after the cursor has left the row** (or after a pause with the cell still blank), not while it is being typed. The outline carries an icon or text as well, not colour alone.
- One **corner notice** (bottom right) says what is blocking, e.g. "Four Roses Single Barrel cannot save until you select a category". With several blocked rows it is a single updating notice with a count and a way to jump to the first. It stays while any row is blocked, does not take keyboard focus, and is announced politely to screen readers.
- Rows show a quiet drafted or saved state.
- **Find-or-create on the server.** Two rows for the same new brand and label (typed or saved at nearly the same time) resolve to one label; a unique-constraint collision must not surface as an error.
- Failed saves (server error, a row deleted elsewhere) mark the row and keep what was typed.
- **The server decides, not the sheet.** Every save and delete is scoped to the signed-in account: ids sent from the browser are checked against that account's own rows, and a request for someone else's row fails. Locks are enforced server-side too: a crafted request must not change a locked label field from a bottle row. Every cell is validated on the server with the same rules as the single forms. *(Settled by the spec writer; not negotiable.)*
- **Changing a label's category never clears stored facts.** The fields the new category does not use are left as they were and are simply not shown, exactly as the phone app's label edit behaves (`patchLabel` writes only the columns the category uses). Only a **new** row saves its non-applicable cells blank. *(An earlier draft of this spec asked for a confirmation before clearing; checking the code showed nothing is cleared on an edit, so the rule was dropped.)*

### Deleting

- Rows are selected with checkboxes; delete asks for confirmation and states what goes with them, e.g. "Delete 2 labels and the 5 bottles on them." The existing delete-confirm convention (DESIGN.md §38, `GridEditBar`) is the starting point.
- In the Bottles view a row is a bottle: deleting it removes only the bottle, and its label stays even if it was the label's last bottle. Labels are deleted only in the Labels-only view. *(Spec writer's call.)*

### Leaving the page

- If any row is blocked or unsaved, leaving the page warns first.

### Labels-only view

- One row per label. Besides the label fields it shows a bottle count (the owner has not confirmed this column; builder may propose). Renaming a label or changing its brand can hit the unique constraint; that marks the row like any failed save.
- Deleting a label here goes through the same confirmation, naming its bottles.

## Look

Chosen by the owner after mockups ("B", merged with the bottle rail). The goal is the app's own table language, not a spreadsheet's boxed cells; the app's design rules ask for "a beautiful reference table, not a collection of mini cards" (DESIGN-TOKENS §25).

- Cells are plain text on ruled rows: hairline row rules, small uppercase muted headers, the app's existing hover tint. No box around each value, no filled header bands. An input box appears only on the cell you are in, using the 2px focus ring from the tokens.
- Cells render as text, and **one editor mounts only on the active cell**. That is the look, and also what keeps 300+ rows with many comboboxes responsive.
- Faint vertical column lines between cells, to follow a column across many fields.
- **Brand and Label are frozen** at the left (with the checkbox and state columns), at narrower widths than the rail-less layout (the mock used about 130px and 180px). Long names truncate, with the full text on hover and in the rail.
- Label and Bottle appear as plain group labels over the headers, with one darker vertical rule between the two groups.
- Row state is a small glyph beside the row (just saved, draft, blocked), not a coloured wash. Locked cells are grey text with a lock mark on hover.
- A bottle's own proof, age and size are their own columns in the Bottle group (blank shows the label's value in grey), so no marker is needed on label cells. The ink dot in the mockups is dropped. **Tape and marker are not used:** the app reserves them for real bottle facts (DESIGN-TOKENS §27).
- Compact 36px rows by default; the tokens also define a 44px default, so a density switch is cheap.
- Fonts and colours are whatever the web app already loads (Aileron and the Georgia display face at the time of writing; the design doc names Inter and Source Serif 4, but the stylesheet and layout are what ship). Use the existing tokens; add none.
- Category colour appears only on the rail's photo frame, the one place the app already uses it. No gradients, glass, large rounded cards or colour floods.

## The rail

A panel at the right of the sheet that follows the row the cursor is in. Chosen by the owner.

- **Display only.** All typing stays in the sheet, so there is one place to edit and one keyboard flow.
- Shows the bottle in the Bottles view and the label in the Labels-only view (its own photo frame, name and facts; in the Labels view, how many bottles it has).
- **Open by default on wide screens; collapses to a slim tab on narrower ones** (the mock guessed about 1100px; the builder sets the real figure by testing). Once the owner toggles it, the choice is remembered in the browser.
- **Not a live region.** It changes on every cell move, so it is not announced to screen readers; the sheet itself carries each row's information.
- Contents, top to bottom: identity (photo frame in category colour, or the app's intentional placeholder; brand; label), **On your shelf**, facts, and a short "still blank" list.
- **Facts say where each value comes from**: from the label, or this bottle's own with the label's value alongside.

### On your shelf

Shows what the owner already has from the brand being typed, so duplicates are visible and locked cells are explained. It changes with the cursor:

1. **A known brand typed, no label yet:** a plain count ("5 bottles from 3 Four Roses labels") and a list of the brand's labels with how many of each.
2. **An existing label chosen:** the same list with that label highlighted, plus a count line ("Your sixth Four Roses bottle", "Third Single Barrel"). The label's fields fill in and lock.
3. **A new label under a known brand:** a "New label" badge saying saving adds it under the brand, with the brand's existing labels still listed.
4. **A new brand:** a "New brand" badge saying nothing from that brand is on the shelf and that saving creates the brand and its first label. This is the cue to check the spelling.
5. **A brand with many labels:** the five owned most of, then "+N more labels". The list never pushes the facts off the panel.

Rules:

- Counts include bottles in this sheet that have not saved yet, shown as "n not saved", so a bottle typed ten minutes ago cannot be entered twice.
- The wording is plain counts and ordinals, no jokes. The numbers being true is the point. First-bottle and no-brand cases need their own wording ("Your first bottle of …").
- Computed from rows the editor has already loaded where possible. **Builder: confirm the Labels-only view still has per-label bottle counts, and that nothing needs a new query.**

## Later (not in the first version, but wanted)

Decided to wait, and written down so they are not lost:

- **Grouping** rows (for example by brand or category, with counts).
- **Saved views**: a named set of toggles, columns, filters and sort that can be reopened.
- Import from a spreadsheet, as a separate migration feature.
- A shared, moderated label database, which the Label cell could later link to.
- Undo for edits.
- Carrying the collection table's current filters into the editor ("edit these 40 bottles").

## Replaces

- Remove the Edit toggle, row checkboxes and `GridEditBar` from `bottle-table.tsx` and `label-table.tsx`; the collection pages link to the editor instead of "Bulk add".
- Remove `/bottles/bulk` and `/expressions/bulk`; keep the URLs working by redirecting to the editor.
- Reuse what fits (`BulkGrid`, `GridCell`, `use-grid-nav`, the bulk server actions) and delete what ends up unused. Do not leave dead code.
- No schema change is anticipated.

## Left to the builder

Route and entry-point placement; which existing grid pieces to keep or rewrite; the near-match rule; how the Labels/Bottles toggles persist; whether repeated label values on consecutive bottle rows are merged or repeated (default: repeated); keyboard-navigation semantics; rendering strategy for 300+ rows (no virtualization unless measured to need it).

## Verification

- CI does not run the database-backed or Playwright suites. Run them against a scratch database and show counts in the PR.
- Update `e2e/grid.spec.ts` and anything else that clicks the Edit toggle.
- Check that nothing the iOS app depends on changes.
- Exercise it for real: enter a few dozen mixed bottles by keyboard alone (apart from the unlock), including a repeated new label, a typo near-match, a blocked row, and a delete.

## Calls made without the owner (flagged for review)

- Entry point and redirect of old Bulk add URLs.
- The bottle count column in the Labels view.
- The exact "On your shelf" wording and the five-label truncation.
- Compact 36px rows as the default; the Bottle group's own proof, age and size columns are hidden by default in the Fields picker (most bottles inherit).
- Bottles-only view has no unlock; changing a shared label from a bottle row needs Both.- Brand and Label are always visible regardless of the toggles.
- Server-side ownership checks and lock enforcement; deleting a bottle keeps its label; the editor lists the same rows the collection table does.
- Leaving the page warns instead of persisting drafts.
- Tab accepts existing matches only; creating needs Enter.
