# Editing bottle and label facts on the phone: design

Status: decided in conversation on 2026-10-08, against a screen-by-screen mockup (twelve screens; a private Artifact, summarised below). Nothing is built yet.
Issue: #177. Offline editing is deliberately not here; it is #189.
Builds on section 8 of `2026-10-05-design-language-design.md`. Where this file and that one disagree, this file is newer.

## 1. What is decided

| Question | Decision |
| --- | --- |
| Where does editing start? | **Per section.** The bottle page's **Label** and **Bottle** sections each get their own **Edit** action in the section header (44 pt target). One section edits at a time; the other's Edit dims. One section means one record, one request, one Save. |
| Why not one Edit for the page? | It writes two records, so a failed second request leaves the page half saved, and label edits (which affect other bottles) would blur into bottle edits. |
| Read view | As today, plus **Barcode** and **Release year**. Empty facts stay hidden in the read view. |
| Edit view, bottle | Facts grouped as **Where it came from** (Paid, Store, Acquired), **This bottle** (Batch, plus an "Add a detail" row of chips for Release year, Barrel, Pick name, Location and Notes that are not recorded yet) and **Use** (Opened, Status). Only recorded facts are rows. |
| Edit view, label | Notice at the top: "This label is shared. N of your bottles use these facts. Changes show on all of them." Then Brand, Name, Category, Proof, Age statement, Size, MSRP, Distilleries, Mashbill, Finishes and Barcode. |
| MSRP | A **label** fact (bottles have no MSRP of their own). It appears in the Label edit view only, and is shown on the bottle page as it is today. |
| Status | **Derived, never typed.** It follows fill level and Opened. |
| Opened | An editable **date**. Setting it opens a sealed bottle. Clearing it asks, see section 3. |
| Undo | Two places only: **↺ on each changed field** while editing (puts that field back), and a **bar for about 8 seconds after Save** with Undo, which sends the previous values back. No longer-lived undo and no server history. |
| Leaving with unsaved edits | Cancel asks "Discard your changes?"; the default is Keep editing. |
| Invalid value | Marked under the field in words as well as red; Save stays off. |
| Brand and Name | **Editable.** Brand is a link to a brand, chosen from yours or created by name (it does not rename the brand for other labels). A label is unique by brand and name, case-insensitively. A clash is stopped and offers a merge. |
| Merge | **"Merge into that label"**: moves this label's bottles and tastings to the other, the other label's facts win by default, you can keep your own value for any fact that differs, and the old label is removed. **It cannot be undone.** Online only. |
| Distilleries, Mashbill, Finishes | Chips with "+ Add", which opens a **picker**: your existing names with the label's current ones ticked, a search box, near-match suggestions, and a last row to create a new name. |
| Offline | Not in v1. Edit is unavailable with a note when the app has no connection. Queue, "Waiting to send" and the **Messages** list under Account are #189. |

## 2. Rules the server enforces

The phone shows these; it never decides them.

- **Ownership.** Every id is the signed-in account's own. Someone else's bottle, label, brand or store is "gone" (404), never a permission error.
- **Label identity.** `(brand, name)` is unique per account (the database already enforces it, with the name compared without regard to case). A save that would collide answers **409 `name_taken`** with the label it collides with, so the app can offer the merge. Nothing is written.
- **Brand.** Chosen by `brandId`, or by `brand` (a name): found without regard to case, created if new, in the same transaction as the label so a failed save leaves no stray brand.
- **Barcode.** Unchanged for a request that carries only `upc` (it fills an empty barcode and never overwrites, as the scanner relies on). Inside a full label edit the barcode may be changed or cleared.
- **Same rules as the web.** Field validation reuses the web's label and bottle schemas (proof 0 to 200, a past date for acquired and opened, a barcode of 6 to 32 digits, and so on), so the phone and the web cannot disagree.

## 3. Opened, sealed and fill

The bottle's open state is three columns that must agree: `is_open`, `date_opened`, `status`, and the level (`fill_pct`).

| Request | Result |
| --- | --- |
| `dateOpened` set to a date | Bottle is open; status `owned` becomes `open`. A future date is refused. |
| `dateOpened` cleared, bottle is open | **422 `opened_cleared`** unless the request also says what to do (`ifOpenedCleared`): |
| &nbsp;&nbsp;`"keep_open"` | Bottle stays open with **no date**. Status unchanged. |
| &nbsp;&nbsp;`"seal"` | Bottle is sealed: `is_open` false, `date_opened` null, **level set to 100**, status `open` becomes `owned`. This replaces the level whatever it was; the app says so on the button. |
| `dateOpened` cleared, bottle already sealed | Nothing to do. |
| `fillPct` | As today: below full opens a sealed bottle. |

**A conflict to resolve before the app ships.** The web's `setBottleDateAction` treats clearing Opened as *closing the bottle*, because "open with no date" is a state the rest of the app was written not to mean. "Keep it open, no date" creates exactly that state. This change does not touch the web action. Before the iOS work, someone needs to check what the collection table, the Tonight pool and the stats do with an open bottle that has no date (most likely nothing, since `is_open` is what they read), and decide whether the web should offer the same choice.

## 4. Merge

`POST /api/v1/expressions/:id/merge` with `{ "into": <label id>, "keepMine": ["proof", ...] }`. `:id` is the label that goes away.

- **Both labels must be the caller's, and different.** Otherwise 404 or 422.
- **One transaction.** Either everything below happens or nothing does.
- **Facts.** The label merged into keeps its values. For each name in `keepMine` (from `categoryId`, `proof`, `ageYears`, `ageStatement`, `sizeMl`, `msrp`, `upc`) the removed label's value is copied over. Its distilleries, mashbills and finishes are not carried over.
- **Photo.** The label merged into keeps its photo. If it has none, it takes the removed label's. A photo file is deleted only if nobody ended up using it.
- **Bottles and tastings.** Every bottle and every tasting of the removed label moves to the other. They move in **one statement** because tastings point at their bottle and label together (`tasting_notes_bottle_expression_fk`, no `ON UPDATE CASCADE`), and changing the bottle's label alone would break that key.
- **Older names.** The removed label's current name becomes an older name of the other (unless it already is one), and its bottles are set to that name, so they still read as what they were bought as. Its own older names move across; a name the other label already has is reused, and the bottles that pointed at it are re-pointed.
- **Releases.** A release whose name the other label already has is replaced by that one (bottles re-pointed); the rest move across.
- **Approvals (COLAs).** Moved across; one the other label already has is dropped.
- **Everything else** that still points at the removed label cascades away with it. Because a new table that points at labels would silently be lost this way, the PR adds a test that lists every foreign key into `expressions` from the schema and fails when one is not handled or knowingly left to cascade.
- **Answer.** 200 with the surviving label and counts of what moved. Not undoable.

## 5. API

All under `/api/v1`, additive within the version.

| Route | Change |
| --- | --- |
| `PATCH /bottles/:id` | Takes `fillPct` (as today) and now also `pricePaid`, `storeId`, `dateAcquired`, `location`, `notes`, `batch`, `releaseYear`, `barrelNumber`, `pickName`, `dateOpened`, `ifOpenedCleared`. Strict: an unknown field is a 422, not ignored. Answers with the open state as today (`fillPct`, `isOpen`, `status`, `dateOpened`) and the app re-reads the bottle. A field set to `null` clears it. |
| `PATCH /expressions/:id` | Takes the label facts in section 1, partially. A body of only `upc` keeps today's behaviour. 409 `name_taken` as above. |
| `POST /expressions/:id/merge` | New, section 4. |
| `GET /lookups/:kind` | New, a later PR. `kind` is `brands`, `distilleries`, `mashbills`, `finishes` or `stores`; optional `q`. Feeds the pickers. |
| `POST /lookups/:kind` | New, a later PR. Creates a brand, distillery or finish by name (the picker's last row). **Mashbills and stores are not created from the phone in v1**; a mashbill is a recipe and a store has a place, so both are added on the web. |

Errors keep today's shape: `{ error: { code, message, fields? } }`. `name_taken` adds `existing: { id, title }`.

## 6. Order of work

| # | Piece | Depends on |
| --- | --- | --- |
| 1 | This spec | nothing |
| 2 | Merge endpoint | nothing (it takes ids) |
| 3 | Bottle and label PATCH | nothing |
| 4 | Lookups (pickers' data) | nothing |
| 5 | iOS: read view, per-section edit, undo, discard, validation | 3 |
| 6 | iOS: pickers | 4 |
| 7 | iOS: merge flow | 2, 3 |

Items 2 to 4 are independent, so they can be reviewed and merged in any order.

## 7. How it is checked

- Route tests for each handler, with the data layer stubbed, in the style of the existing `/api/v1` tests: ownership, the strict field list, each branch of section 3, `name_taken` with the colliding label, the `upc`-only compatibility path.
- The merge's SQL is run against a real Postgres (a throwaway database) with a label that has bottles, tastings that point at those bottles, older names, releases and an approval. The result is checked row by row, and the tasting foreign key is shown not to trip. The stubbed tests cannot show this.
- The foreign-key inventory test from section 4.

## 8. Not decided here

- Whether the web should offer "keep open or mark sealed" (section 3).
- Merging from places other than a name clash (the endpoint allows any two of your labels; no screen offers it).
- Restoring a merged label. If it is wanted later, the removed label would be kept hidden for a period; it was considered and left out.
- Editing a bottle's own proof and age overrides, and its photos, from this screen.
