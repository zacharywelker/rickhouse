# The data-sheet look for the label and bottle forms (phase 4C): design and plan

**Status:** decisions taken by the owner on 2026-11-25; not built.
**Part of:** the add-bottle redesign, phase 4C (`docs/superpowers/plans/2026-11-24-add-bottle-redesign-phase-4-overview.md`). Design record: `2026-11-23-add-bottle-redesign-design.md` section 3 and the screenshots under `2026-11-23-add-bottle-redesign/screenshots/` (`00-data-sheet-layout.png` is the model).

## Intent

The label and bottle forms are long stacks of labelled boxes. The redesign wants a dense **data sheet**: a row for each concern with a small-caps label on the left, short facts as chips you can type into, choices as chips that open a popover, optional things as dashed "+" chips, several-entry things as small tables with a Share column, and rare things on a "More:" line. It should fit a half-screen laptop (864px) with little scrolling.

## Governing rules (read before building)

- **Tokens: today's.** Chips, rows and the More line are built from today's components and colours (`src/app/globals.css`, `src/components/ui`). DESIGN.md's target palette is *not* used (its "does not use" list, and its note that the app still implements the older direction, are why: nothing here is a step towards it or away from it). The look moves in one place later, with the rest of the app.
- **No rule, field or save changes.** This is a renderer. `fields.ts`, `rules.ts`, the field matrix, the save paths and the API are untouched, so the field matrix and every existing test keep guarding behaviour.
- **Design width 864px.** Below it the rows stack (label above the chips); nothing is designed for a phone (the iOS app is that).

## Decisions (owner, 2026-11-25)

1. **Keep today's tokens.**
2. **Parallel "new look" behind a toggle**, not an in-place conversion: the old and the new form both exist until the owner has used the new one. (Cost accepted: two renderers to keep in step, and tests for both.)
3. **Unset optional fields are dashed "+" chips** that open the input; never "Unknown", never an empty box.

## Approaches considered

- **A. A second renderer over the same field data (chosen).** `FieldSpec`s and the section `rows` stay the data; a new set of chip components draws them when the toggle is on. Rules and saves are shared by construction, which is what makes the toggle cheap to keep honest.
- B. Fork the forms. Rejected: every later rule change would have to be made twice.
- C. Convert in place (the owner declined it for now; it is where the toggle ends: once the new look is trusted, the old renderer is deleted).

## Design

### The toggle

`useNewLook()` reads a per-browser setting (`localStorage` key `rickhouse.newLook`, default off, wrapped in try/catch; it can be absent) and the forms show a small "Try the new look / Back to the old look" link in their header. Off is today's page, byte for byte. A `?look=new` query switches it for a session (for e2e and screenshots). No database column, no server render difference: the forms are client components already.

### The components (`src/components/sheet/`)

| Component | What it draws |
|---|---|
| `SheetRow` | A small-caps label (left, fixed width) and the chips (flex-wrap) beside it; stacks under 640px |
| `ValueChip` | A number, text or date fact: label inside the chip, input inline ("Proof 117.9"); error text under the row |
| `SelectChip` | A select as a chip that opens a popover (the existing `Popover`); shows the chosen value |
| `ToggleChip` | A checkbox as a capsule that fills when on ("Cask strength", "Straight"); a real checkbox underneath for keyboard and screen readers |
| `AddChip` | A dashed "+ Statement" button for an empty optional field; click shows its input and focuses it; emptying it again returns the chip |
| `MoreLine` | "More:" and a row of links; each reveals the field group it names |
| `SheetTable` | Column headers (Distillery, Share, Source…) over the existing pickers' rows; the picker keeps its logic |

All are real buttons or inputs (focus-visible, 44px touch where it is a tap target on touch devices), and an `AddChip` has an accessible name ("Add UPC").

### From a spec to a chip

A pure function `chipKind(spec): "value" | "select" | "toggle" | "add-value" | "add-select"` (unit-tested): `checkbox` → toggle; `number`/`text`/`date` → value when it has a value or is required, else add-value; `select` → select (an "unset" choice shows as `add-select`). Composites keep their component (Proof and ABV, the age years/months/days, Size and Price). A layout table per section (`SHEET_LAYOUT`, next to the sections) names each row's label and its fields in order, taken from the mockup; a field not in the table falls back to one row of its own, so a new field is never lost.

### Slices (each its own PR; each ends with the toggle on showing it, and the old look unchanged)

1. **Primitives, toggle, and the label's top rows:** the components above, `chipKind`, `useNewLook`, and the Name, Strength, Size and price, and Age rows of the label form. Screenshot at 864px.
2. **The per-spirit sections:** the Still, Process, Rum, Gin, Agave, Brandy, Amaro and Liqueur detail rows (mostly generated from the section data), and the "More:" line on the label (Description, Vintages, Regions, TTB approval…).
3. **The tables:** Distilled by, Mashbill, Finish and the ingredient and shares tables, with column headers, over the existing pickers.
4. **The bottle form:** Bought, Which one (Batch, Year, Sealed / Opened), the More line (Single barrel, Private selection, Notes, "This bottle differs from the label").
5. **Pinned Save and the Add bottle page:** the Save button pinned top right, and the new look on the Add bottle page and the bulk editor's popups (they share the forms). The one-page "1 The label / 2 The bottle" structure and its search-first start are **4D**, not here.

## Not in 4C

The photo slot (phase 5; a placeholder is drawn where the mockup has it), the one-page structure (4D), a move to DESIGN.md's palette, any new field or rule.

## Testing

No component-test library is installed (vitest runs in `node`). So: the pure pieces (`chipKind`, the layout table covers every field of every section, no field drawn twice) are unit tests; behaviour is Playwright against the throwaway database with `?look=new` (type into a chip, the "+" chip opens and closes, popover choices, the More line reveals a group, a save round-trips, keyboard reachability), run for both looks on the label form so the toggle cannot rot; screenshots at 864px for each slice go in the PR.

## Review focus

1. **Parity:** every field the old form shows, for every category, is reachable in the new one (a unit test walks the field matrix per kind and asks the layout table).
2. **Hidden values are not lost:** a field hidden by a rule keeps its value on save in both looks (the existing rules do this; the new renderer must not post blanks for fields it does not draw).
3. **Keyboard and screen reader:** every chip is operable without a mouse and has a name; a dashed "+" chip is a button.
4. **The toggle is per browser and safe when storage is blocked.**
5. **The bulk editor popups** (they embed the label form) keep working in both looks.

## Left to the builder

Exact spacing and the chip's border and fill (from today's `Badge` and `Button` variants), the popover's width, and the animation (none is required).
