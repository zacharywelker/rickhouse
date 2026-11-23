# Bulk editor: pasting into a new row fills that row

**Status: approved by the owner, 2026-11-21.**

Raised by the Codex review of #379 and confirmed by trying it: pasting onto a new row that has been typed or inserted does not fill it. It adds a separate new row at the bottom and leaves the target alone ("Pasted 0 cells. Added 1 new row."). Only the empty row at the bottom behaves like a fill, and only because its key happens to match the first row a paste makes. The owner chose to make a paste fill the new row it lands on.

## Why

A paste is how rows get entered in bulk, and the sheet already treats a pasted line landing on a saved row as "write these cells into that row". A new row is a row the person is entering: after Insert record below it is the row they just made, sitting where they want it, with its brand and label already copied. Pasting a price or a proof onto it and watching it appear in a different row at the bottom, with no brand or label, is the one place paste does not do what the cursor says.

## Behaviour

What is pasted is a grid: rows of cells, as copied from a spreadsheet. It starts at the cursor cell, not at the start of a row, and only the cells copied are written. Pasted row *i* lands on the sheet row *i* rows below the cursor, and its cells on the columns from the cursor's column to the right; cells past the last column are reported and skipped, as now.

| The pasted row lands on | Today | New |
|---|---|---|
| A saved row | Its cells are overwritten | Unchanged |
| A new row (typed, or inserted) | Ignored for that row; a separate new row is added at the bottom | The pasted row fills that row |
| The empty row at the bottom | Becomes a new row (by key coincidence) | Becomes a new row filled from the pasted row, on purpose |
| Past the last row | New rows | Unchanged |

Filling a new row is "as if typed", for the columns pasted only:
- A pasted **brand, label or category** that is a complete name that exists is chosen; anything else waits to be chosen (marked "Choose"), and a paste never creates a brand or label. A pasted brand different from the row's drops the label and category that belonged to the old one, as choosing a different brand does.
- **Every other value** is kept in the row, checked as when typed; one that does not parse is reported and skipped.
- **A blank pasted cell leaves what the row has.** The row keeps its place, its key, and what Insert copied into it (its brand and label) unless the paste names a different one.
- A paste never saves anything by itself. A row saves when the cursor leaves it, as before; a row that has had values pasted into it is no longer blank.
- The notice counts what really happened: cells pasted (now including those into new rows), and "Added N new rows" only for rows that were made.

## Goals

- A paste lands where the cursor is, on every kind of row.
- An inserted row keeps its position and context when pasted into.
- Pasting at the empty row works as it did (the existing `:1736` intent), without depending on a key coincidence.

## Non-goals

- A selected block filled with one copied cell (a range and a single value) over new rows: unchanged, reported as before.
- Lists and panels (distillery, finish, ingredients) in new rows: still named as "changed in its picker".
- Changing how pasting onto saved rows works.

## Approaches considered

1. **Generalise `makeNewRows` to take the draft a line lands on** (chosen). Each pasted row becomes "fill this draft, or make one": the per-cell reading, name matching and settling that `makeNewRows` does today is reused unchanged, applied to the existing draft (and its stored edits and waiting text) instead of a fresh `emptyDraft`. The smallest change that keeps one reading of a pasted cell.
2. **Send each pasted cell through the same commit path typing uses.** More uniform, but typing goes through combo editors (a picker, Enter to create) that a paste deliberately skips, so it would change what a paste may do.
3. **Delete the target and recreate it from the line.** Loses the row's key and place (an inserted row would move to the bottom). Rejected.

## Constraints

- A paste creates nothing on the server; nothing new is saved by it.
- Keys: filling reuses the target's key; rows that are made take keys from the sheet's key floor, which the fill must advance past any key it uses (the same rule as the key fix in #379).
- Up to 300 new rows per paste, as now.
- Delivered as its own PR on top of #379 (it needs Insert), with its own tests: unit tests for which line lands on which row, and end-to-end for each row kind and for the unchanged behaviours above.

## Left to the builder

The shape of the refactor, the helper that decides each line's target (pure, with tests), and the wording of the notice.
