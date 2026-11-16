# Bulk editor: one value per field, shown at the level it comes from

Follows the bulk editor (#308, built) and the owner's first round of real use (#359). It **replaces the "Locked and overridable cells" section of `2026-11-10-bulk-editor-design.md`**: the separate "This bottle's proof / age / size" columns go away, and a value is no longer a label column plus a bottle column.

## Why

The sheet has too much in it. For proof, age and size there is a label column and a second "this bottle's own" column, and the same split for a few spirit-specific fields. A person looking at a row cannot tell which number is real, and the extra columns make the sheet feel like a tool for experts. Worse, the sheet states things that are wrong: the Pinhook Vertical Series Bourbon has a different age and proof for each yearly release, the collection page shows this correctly, and the sheet shows "2 years" everywhere because the label is marked Straight.

## What the owner wants, in short

- **One Proof column, one Age column, one Size column** (and one cell for each spirit-specific override). Each shows the value that actually applies to that bottle: the bottle's own, else its vintage's, else the label's.
- **Typing changes the level the value came from**, so the number never has to be entered twice.
- The person must **always be able to tell which level a value belongs to and which level an edit will change**, in a way that is quiet. Most of the sheet is plain label values and must stay plain.

## Words

- **Label**: the product, as today.
- **Vintage**: what the app currently calls a *known release* (`expression_releases`, chosen on a bottle through `bottles.releaseId`). The owner's name for it, borrowed from wine. It is a **name, not a year**: `2025A`, `Vertical Series`, a nickname such as a Booker's batch, or a year. Some labels (Alberta Premium) have yearly vintages that differ only in proof. A label may have none. The year is optional.
- **Single barrel**, **private selection**: two **independent flags on the bottle** (the sheet's "single barrel / pick" cell holds single, pick, both or neither). A private selection is not necessarily one barrel (Barrell Craft Spirits blends barrels for selections), and a single barrel is not necessarily a private selection (Russell's Reserve Single Barrel is released that way by the distillery). Nothing is shared between bottles: the pick details live on each bottle, and two bottles from one barrel are two unrelated bottles. The owner does not expect to own several bottles of one barrel and does not need to edit them as a group.
- **This bottle**: the bottle row itself.

## Goals

- One column per value, showing the effective value, with a **source marker** where it is not the label's.
- Edits land on the right level by a fixed rule, and the person is told which before they commit.
- A **scope switch** for the one real choice (shared level or only this bottle).
- A **new-bottle flow that works for someone typing everything left to right**, including marking a private selection or single barrel late.
- Vintages can be **created from the bottle row** by name.
- Applies to **proof/ABV, age (years, months, days, statement), size**, and **tequila class, brandy grade, gin NAS**.

## Non-goals

- A tree of label, vintage and bottle rows. Considered and set aside: it would fight keyboard navigation and filtering, and looks wrong for labels with no vintages.
- A shared "selection" or "barrel" record, or editing bottles from one barrel together.
- Changing what a vintage, a label or a bottle stores. The bottle overrides (`bottles.proof`, `ageYears`, `sizeMl`, `tequilaClass`, `brandyGrade`, `ginIsNas`, and so on) and `expression_releases` already exist; this is how the sheet reads and writes them.
- The other round-one observations in #359 (overlay pane, resizable and reorderable columns, filters for blanks, and so on). Only the ones this design touches are covered here.

## Anti-goals (a failure even if it technically works)

- A value silently changing at a level the person did not expect, above all a label's default changed from a bottle row.
- A private selection's proof or age ending up as the label's default, so that every later bottle of the label inherits it.
- A new person ever having to learn the scope rules to avoid damage.
- A shortcut that works on one operating system and not another.

## The decisions

### 1. One value, shown at its source

A cell shows the first of: the bottle's own value, its vintage's value, the label's value. This must be the **same resolution the collection page uses**. In particular, a derived age (for example "Straight" implying two years) applies only at the label level and only where no vintage or bottle value exists; it must never override a vintage's age, which is the Pinhook defect.

A label whose vintages disagree shows **"Varies"** at the label level instead of a dash (and so does a label marked cask strength whose bottles differ). The Labels-only view shows "Varies" the same way.

### 2. Where a typed value goes

| The bottle is | Typing changes | Switch |
|---|---|---|
| a single barrel or a private selection | this bottle | none: always this bottle |
| on a vintage (and neither of the above) | that vintage, and so every bottle of it | the vintage, or only this bottle |
| neither | the label, and so every bottle of it | the label, or only this bottle |
| a new row for a new label | the new label's defaults, until the row is marked a single barrel or private selection | none |

"Only this bottle" writes the bottle's own override. Clearing a value at a level removes that level's value, so the next level down shows through.

### 3. The source marker (at rest)

A value that does not belong to the label carries a small marker in the cell: one for a vintage, one for a single barrel, one for a private selection, one for both. A label's own value has none, so a plain sheet stays plain. A hover says it in words. The same marker applies to every field in this design, including size and the three spirit-specific overrides. A bottle's own size that differs from its label's is marked as this bottle's.

Two styles were mocked up: **small shapes** (diamond, filled dot, hollow dot, half-filled dot) and **tiny letter tags** (V, SB, PS, SB PS). The owner has not chosen yet. Colour is not the signal, so the sheet stays readable and readable in both themes.

### 4. The note while editing

While a cell is being edited, a short note sits under it and says what will change: "Changes the 2025A vintage (2 bottles)", "Changes the label (6 bottles)", "Changes only this bottle", "Changes only this bottle (private selection)". It is the same place and style as the existing "Changes N bottles" note, and it replaces the always-visible "all N" badge (removed in #360). The details pane also says where the selected value comes from. The note never appears at rest.

### 5. The scope switch

Where the table above offers a choice, **Alt+Down (Option+Down on a Mac) toggles it while the cell is being edited**, and clicking the note toggles it. The note names the other choice and the key. The key is the same on every operating system by decision (Ctrl+Down is taken by macOS). **Tab, Enter and Ctrl+Enter keep their present meaning** (move between cells and rows, and create the typed name). Alt+Up does the same as Alt+Down, as there are only ever two choices.

### 6. Column order for adding a bottle

For a person typing left to right, a new row asks about the one-off before it asks about values:

**Brand, Label, Category, Vintage, Single barrel, Private selection**, then size, proof (with ABV next to it), age, and the rest as now. (The owner wrote "SB > PS" and this document reads it as two yes/no columns replacing the present combined cell. See the open items.)

### 7. Creating a vintage from the bottle row

In the Vintage cell, a name that does not exist offers **Create vintage "2025A"**, taken with Enter or Ctrl+Enter, exactly as brand and label are today, with the same protection against typos creating junk. A name is enough; the year is optional and set on the label page if wanted. The vintage and the bottle save together in the row's single save. Values typed afterwards on that row go to the new vintage ("Changes the 2025A vintage (new)"). Until now the Release cell on a bottle row could only pick; this changes that.

### 8. Marking a single barrel or private selection late

A new row that is creating a new label sends its proof, age and spirit-specific values to the **new label** until the row is marked. When it is marked single barrel or private selection:

- **The values that describe the liquid move to the bottle** and the new label is created without them: proof and ABV, age (years, months, days, statement), tequila class, brandy grade, gin NAS. **Size and everything else stay on the label.**
- A corner notice names exactly what moved ("Proof and age are now this bottle's, since it's a private selection").
- Un-marking later does not move them back.
- Only a row that is **creating the label** does this, at the moment of marking.

**The safety net (this session only):** pressing Enter on a value cell leaves the row, and a complete new-label row saves when left, so the person can reach the flag after the label already exists. If a bottle is then marked single barrel or private selection and it is **the only bottle on a label that was created in this session**, the same values move from the label to the bottle and the label's are cleared, with the same notice. A label from an earlier session is never touched this way.

For a row marked single barrel or private selection, **no new vintage is created**, and a name typed in the Vintage cell goes on the bottle's own batch field instead. (This is the document's call, not the owner's; the owner was unsure.)

## Calls made without the owner (from the builder check; please check these)

- **Vintages store only proof/ABV, age (years, months, days, statement), MSRP, photo and notes.** For **size, tequila class, brandy grade and gin NAS** there is no vintage value, so those four resolve bottle, then label, and offer only "the label, or only this bottle". No schema change.
- **Single barrel and private selection map to the existing `isSingleBarrel` and `isSingleBarrelPick` flags** ("pick" is the private selection), as two columns.
- **A bottle can be on a vintage and also a single barrel or private selection.** Nothing clears `releaseId`. Typing always writes the bottle's own value; a value the bottle does not have of its own shows the vintage's, then the label's, with the marker of the level it actually came from.
- **"Created in this session" means held in memory for the page load.** A reload, or a second tab, forgets it, and then nothing moves. "The only bottle on the label" is counted by the server inside the same save, never from the sheet's copy, so another tab or the phone adding a bottle cannot make it wrong.
- **Before a new row has saved, the flag moves the values both ways.** Marking moves the typed proof, age and spirit-specific values to the bottle's cells, and un-marking moves them back, since nothing is stored yet and nothing can be lost. The "does not move back" rule applies only once the row is saved. The corner notice appears for an unsaved row too.
- **A new-label row that has a vintage typed sends its values to the vintage and not to the label**, so the label's own proof and age stay blank. The vintage wins once there is one.
- **"Varies" is display-only.** It sorts and filters as blank, is computed in the Labels-only view too, and applies to every field shown this way. A "Varies" filter is not part of this.
- **The reference for resolution is the collection page and the `bottle_list` view**, which already get the Pinhook case right. The fix is in the sheet's own resolution; the shared view is read first and changed only if it turns out to be wrong.
- **If Alt+Down conflicts anywhere**, the note stays clickable. The key is revisited only if testing shows a real conflict.

## Left to the builder

- The marker glyphs, once the owner chooses a style, and their hover wording.
- How the sheet remembers which labels were created in this session for the safety net.
- Accessibility wording for the note and the marker.
- Where the Vintage column sits when Labels-only or Bottles-only views hide it.
- Migration is not expected, since the stored data does not change; confirm that.

## Open items for the owner

- **Reaching the label from a bottle that is on a vintage.** The table offers the vintage or only this bottle. Typing into a label-level "Varies" cell (Labels-only view) is the open case; see below.
- Marker style: shapes or letter tags.
- Whether Single barrel and Private selection are two columns or stay one combined cell.
- Whether a row marked single barrel or private selection should create a vintage at all (the default above is no).

## Verification

- Unit tests on the resolution (bottle, vintage, label, "Varies"), on the table in decision 2, on the move in decision 8, and on the age derivation not overriding a vintage's age.
- End-to-end on a scratch database: Pinhook-like rows with differing vintage ages; typing at each level and the note's wording; Alt+Down toggling and Tab and Enter unchanged; creating a vintage from the bottle row; a new-label row marked private selection after typing proof and age; the same after leaving the row with Enter, in the same session and after a reload (where nothing moves).
- Screenshots of the marker at rest and the note while editing, in both themes.
