# Housekeeping page: missing photos, missing TTB approvals, likely duplicates

Status: design, awaiting approval. The page is named **Housekeeping** (chosen by the owner; "Tidy up" was the working
name and the filename keeps it). Page order: Photos, Duplicates, TTB approvals. Plans follow in that
order, with the shared TTB links change (below) as its own small first step because it also improves the label
page.

Mockup (current): https://claude.ai/artifact/ARwfwRCCRaR9s6Qs1qTPtz. It uses the app's current look (instant-photo
cards, small outline buttons), not the target look in `DESIGN.md`, so the page matches the rest of the app today.

**Changes since the first draft, all from the owner:** the photo queue is a paged grid that reuses the label page's
photo controls; it has three tabs (labels, single and private barrels, vintages); a per-page dropdown with previous and
next replaces refill and skip; the 600 px minimum applies only to uploads made through this page; a new TTB approvals
section was added. Where the text below still says otherwise, this note wins.

## Intent and why

A large collection is hard to keep clean in bulk. Photos are added one label at a time through the label form, and
near-duplicate lookup rows ("Buffalo Trace" and "Buffalo Trace Distillery") pile up with nothing to fold them
together: every field type except labels can only be deleted, and delete is blocked while anything uses the row.

The owner wants one page for **occasional maintenance**, not a one-time cleanup. They open it now and then, work the
list down, and leave. The page has to be quick to scan, say plainly when there is nothing to do, and never re-ask a
question already answered.

## Goals

- A **Tidy up** page, one per account, with a summary of both jobs at the top and a count for each.
- **Photos:** list labels that have no picture, and make filling them a fast loop (paste a link, paste an image, or
  drop a file; the focus moves to the next label after each save).
- **Duplicates:** list likely duplicate pairs for each field type, ranked best-first, and merge a pair in one step.
- "Not a duplicate" is remembered per pair, so a repeat visit shows only new candidates.
- When both counts are zero the page says so and is finished.

## Non-goals

- No web search, no image-search API, no "search the web" link. Photos come from files, pasted links, or pasted images.
- No automatic merging and no automatic photo saving. Every merge and every photo is a user action.
- No photo editing or cropping, and no bottle-by-bottle gallery management. That stays on the bottle page.
- No fuzzy matching inside the database (no Postgres trigram extension).
- Categories are not on this page (see Constraints).
- iOS is out of scope for now. The page is web; the server code is reusable by iOS later.

## Anti-goals (a failure even if it works)

- Re-offering a pair the owner already dismissed.
- A merge that silently loses links, tastings, names or photos.
- Saving a blurry thumbnail as a label's photo because a link "worked".
- A page that nags when nothing is wrong, or that is slow enough on a big collection that it is not opened.

## Constraints

- Everything on the page is per-account. Counts, candidates and dismissals are scoped to `ownerId`.
- **Categories are shared by every account**, so a merge would change other people's data. They are excluded.
  (My call, agreed with the owner.)
- Merges are one transaction, locked in id order, and not undoable, like `mergeLabels`
  (`src/lib/expressions/merge.ts`). Files are deleted only after the rows are gone.
- Migrations are hand-written SQL plus a journal entry; `drizzle-kit generate` fails in this repo.
- Remote links go through `fetchRemoteImage` (`src/lib/remote-image.ts`), which already blocks private addresses and
  redirects to them. The tidy-up page must reuse it, never a new fetch path.
- CI does not run the DB-backed suites or Playwright. Verification needs a scratch database and counts in the PR.

## Approaches considered

**Finding pairs**

- A. Normalise names, match exactly. Simple, few false alarms, misses typos and spelling variants.
- **B. Normalise, then score closeness in application code (edit distance plus word overlap), ranked, with a
  cutoff. Chosen by the owner.** Catches typos and variants; the tables are hundreds of rows, so this is cheap and
  needs no schema or extension.
- C. Postgres trigram similarity. Needs an extension and a hand-written migration, pays off only at far larger sizes.

**Where photos come from:** shelf-and-phone capture was considered and set aside. The owner works from files on a
computer or links copied from an ordinary image search.

## The design

### Page

A new page in the signed-in app (route and nav entry are the builder's call; the existing `/admin/[resource]` pages
are lookup editors and are not the right home). Top summary with two counts. Two sections, Photos and Duplicates.

### Photos

- **Queue:** labels (`expressions`) with no picture. A label's photo shows for all its bottles, so one photo fixes
  every copy. "No picture" means whatever the collection grid would currently show as empty; the builder reads the
  grid's image resolution (label photo, then release or bottle primary) and uses the same rule. (My call.)
- **One row per label** showing its name, with three ways to fill it: paste a link, paste an image from the
  clipboard (Ctrl/Cmd+V while the row is focused), or drop/choose a file.
- **Preview before saving:** the fetched or chosen image is shown with its pixel size.
- **Automatic rejection of low-resolution images**, as the owner asked. Anything whose longer side is under 600 px
  is refused with a plain message that names the size found. Image-search "copy image address" links are often
  thumbnails of about 200-300 px, which this catches. The 600 px figure is my call; keep it one named constant.
  The existing 10 MB cap stays.
- **Skip** leaves a label in the queue for later. After a save or a skip, focus moves to the next row's input.
- Saves reuse the existing label photo path (`src/app/api/expressions/[id]/photo/route.ts` and `src/lib/images.ts`),
  so thumbnails, cutout detection and cache revalidation behave as they do today. The size check is added once and
  applies to links, pastes and files alike.
- Failures (blocked site, not an image, too small, too large) show on the row and leave it in place.

### Duplicates

- **Kinds in the first version:** labels, brands, distilleries, companies, finishes, ingredients, mashbills,
  cooperages, stores, tags. (My call; "etc" in the request. The builder may drop a kind whose references turn out to
  be unreasonable and say so in the plan.)
- **Matching** is per kind, within one account, and **reuses `src/lib/bulk-editor/suggest.ts`** (`normalise`,
  `distance`, the "close match" rule; see "Merge behaviour, revised" below), so the page and the autocompletes agree.
  A small per-kind table of filler words ("distillery", "co", "inc", "the"...) may be layered on top if the shared rule
  misses obvious pairs. Candidates are ranked best-first within each kind.
  - Ingredients only pair within the same `kind`.
  - Mashbills do not use names. Two mashbills match when their grain recipes are the same, using `recipeKey`
    (`src/lib/mashbills.ts`). Exact only.
  - Labels use the existing label match and the existing `mergeLabels` and conflict picker; this page only lists
    candidate pairs and opens that flow.
- **Dismissals:** a new per-account table of dismissed pairs (kind, the two ids stored in a fixed order, owner,
  date). A pair is never listed again once dismissed. Deleting or merging either row removes its dismissals.
- **Merge:** the owner picks the survivor. Every reference to the other row is re-pointed to the survivor in one
  transaction, then the other row is deleted. Where the same label already linked both, the two links collapse into
  one (the junction tables have unique constraints; collisions must be handled, not left to throw). The merged
  distillery's name is added to the survivor's other-names list so imports still resolve (`distilleryNames`);
  the same idea applies to any kind that has an other-names store. (My call.)
- The builder enumerates, per kind, every table and column that references it (junction tables such as
  `expressionDistilleries`, `expressionIngredients`, `expressionMashbills`, `expressionFinishes`,
  `expressionFinishMashbills`, plus direct foreign keys) and keeps that list in one registry beside the
  `src/lib/admin/registry.ts` conventions, with a test per kind that proves nothing is orphaned.

### Counts and speed

The summary counts must be cheap enough to compute on every visit. If matching is slow for a very large account, the
builder may compute candidates per kind on demand when its section is opened, and show only the photo count and
per-kind "review" buttons up front. The goal is a fast page, not a particular mechanism.

## Decided by the owner

- Occasional maintenance tool, not one-time.
- Sources: files, pasted links, pasted images. No search link, no search API.
- Low-resolution images are rejected automatically.
- Approach B for matching; mashbills by recipe; categories excluded; photos first, then duplicates.
- Merging is confirmed per pair and the survivor is chosen by the owner.

## My calls (for the owner to check)

- Queue unit is the label, not the bottle.
- 600 px longer-side minimum.
- Pasting an image from the clipboard as a third input.
- Dismissed pairs stored in their own table.
- Old names of merged distilleries kept as other names.
- The ten kinds listed above.
- The page is not part of `/admin`.

## Photos, as revised

- **Reuse `LabelPhotoControls`** (`src/components/expressions/label-photo-controls.tsx`) under each card's photo
  frame: the same "Add photo" and "From a link" buttons, the same error line. The card is the app's instant-photo
  frame (`Polaroid`) with "No photo yet". New: paste a copied image onto a selected card; drop a file on a card.
- **Three tabs, with counts:** Labels (label photo), Single and private barrels (bottles flagged single barrel or
  single-barrel pick, photo saved as the bottle's label shot in its gallery), Vintages (a release's own photo).
  Same grid, same controls; the target route differs per tab. (The owner confirmed this reading.)
- **A paged grid, not a refilling queue.** Per-page dropdown (8, 12, 24, 48; default 8), Previous and Next, and
  "1-8 of 11". No Skip and no "show next" button: the owner asked for standard paging.
- **The 600 px minimum applies to uploads made through this page only.** The label page keeps today's behaviour.
  The check is a parameter on the shared store or route that this page sets, so the label form is unchanged.

## TTB approvals

- **Queue:** the owner's labels with no row in `expression_colas`. Paged the same way as photos.
- **Position:** third section, after Duplicates. Summary strip order: Photos, Duplicates, TTB approvals.
- **Same flow as the label page, literally.** "Find on TTB" on a row opens the existing `ColaSearchDialog`, not a
  copy: the same filters, the same results table, the same attach step. Whatever improves that dialog improves
  both places.
- **Per row:** "Find on TTB" (`searchColasAction`, ranked against the label's name, up to five attached at a time),
  a field to paste a TTB ID or registry link (the existing `normalizeTtbId` and add-by-ID path), and "Not on TTB".

### Open the TTB page and the printable version (a change to the standard approvals flow)

The owner wants direct access to TTB's printable Form 5100.31, because it shows the approved label, so a match can
be judged before attaching. Today a search result's TTB ID links only to the registry listing (`colaDetailUrl`); an
attached approval's record already has a "Printable application" text link (`cola-approvals.tsx`) that this leaves
as it is. Plan: `docs/superpowers/plans/2026-11-18-housekeeping-1-ttb-printable-links.md`. The icon sits beside the
ID in the same cell, not in a separate trailing column (my call; simpler and the same in all three tables).

- **Chosen concept (B, by the owner):** the TTB ID stays a link that opens the **TTB page** (`colaDetailUrl`), as today,
  and one small image icon at the end of the row opens the **Printable version** (`colaFormUrl`; both already exist
  in `src/lib/cola/ids.ts`), with its name shown on hover and focus and an accessible label. Both open in a new tab.
  The window's intro line says the icon shows the approved label. (Two text links per row looked ugly; menu,
  expandable-row and preview-pane versions were considered, concepts page: https://claude.ai/artifact/8qWsBuwbNg6Q48PrUUBGQ1.)
- The same pair appears everywhere an approval is listed: the dialog's results, the pending list on New Label, a
  label's approvals record, and a bottle's approvals. One small shared component, so the places stay alike.
- Links go to TTB's site from the browser; the server fetches nothing for them.
- **Unverified:** that the printable form URL opens directly in a fresh browser tab without TTB first setting up a
  session. The builder must check this against the live registry before relying on it; if it needs a session the
  link needs another route (such as the record page's own link) and the plan should say so.
- **"Not on TTB"** records that no approval is expected for that label (older bottlings and small imports may have
  none), using the same dismissal storage as duplicates, so it stops appearing. (My proposal.)
- Attaching uses `attachColasAction` / `addColaAction`, so approvals, label art and permit hints behave as on the
  label page. The page adds no TTB logic of its own.
- **Constraints:** the registry has no API, requests go one a second, and `COLA_LOOKUP=false` turns searching off.
  With lookup off, this section still takes pasted IDs and links, and says search is off.

## Missing details (fourth section, from issue #343)

Records that lack something fillable here, fixed inline on the page (the owner chose inline fix rows over linking
out). Five tabs with counts: Distilleries, Finishes, Stores, Labels, Bottles. Labels and Bottles have a second row of
pills, one per missing field, each with a count, so a list is always "all the labels missing MSRP". A record missing
two things appears under both pills. Paged like the other sections. A summary count on the page's top strip.

Fix rows are sheet-like: Enter saves the row and moves focus to the next row's field, so a run of fixes is a run of
keystrokes (the #343 goal). Saves reuse the existing admin, label and bottle save paths; no parallel write logic.

**Distilleries** (undisclosed placeholders excluded)
- *Location:* no city or state. Fix: city and state boxes, normalised by `normalizePlace` (`src/lib/places.ts`).
- *DSP / NOM:* neither number set. Fix: one box, whose hint follows the country (DSP for the US, NOM for Mexico).

**Finishes**
- *Type.* The column is required and defaults to `other`: a finish made inline with no details (the bulk editor and
  import path, `src/lib/bottles/transfer.ts`) is saved as `other`, and the admin form makes you pick one. It is never
  empty. So "missing" means `other`, which cannot be told apart from a finish whose type really is other. The tab
  therefore says so, and "Leave as Other" records the decision so it stops being listed. Making the column nullable
  would be more exact but is a schema change; not proposed. (Owner asked to confirm the behaviour; this is it.)
- Fix: a type picker (wood, wine, fortified, beer, spirit, other).

**Stores** (online stores excluded)
- *Location:* no city or state. Fix: city and state; "It's online" sets `isOnline` for a store never marked. The
  unique key is name plus place, so a save can collide with an existing store; report that as a merge candidate.

**Labels**, by what is missing
- *Mashbill* and *Distillery:* a label whose distillery is an undisclosed placeholder is left out of both (owner's
  rule; my reading is that an undisclosed distillery also means the mashbill is not knowable). Where the brand's
  other labels agree (at least three, all identical) the row suggests the value with its evidence ("6 of 6 other
  Wild Turkey labels use ..."); Accept saves it, Choose another opens the picker. A suggested distillery is saved
  as an inferred link (`expression_distilleries.is_inferred`). Nothing is applied without a click. Where siblings
  disagree or are too few, the row says so and offers the picker alone. Non-distiller producers need no distillery.
- *MSRP:* no MSRP. Fix: a money box.
- *Proof / ABV:* no proof (ABV is generated from proof, so only proof is entered; the row shows the ABV as you type).
- *Age:* no age years, months, days or age statement, and not marked NAS, on a category whose form has an age field
  (the builder follows the label form's rule). Fix: years, or "It's NAS" (sets `isNas`).
- Releases and vintages can override a label's proof, age and MSRP; how a label with complete releases but a blank
  own value is treated is the builder's call, and the plan should state it.
- Rows link to the bulk editor for anything that is not a clean fix.

**Bottles** (wishlist and sampled bottles excluded)
- *Price paid:* no price paid, on a bottle acquired by purchase, allocation, lottery or secondary. Acquisition
  defaults to `purchase`, so a gift never marked as one would be listed; the row offers "It was a gift", which
  sets the acquisition. Gifts and trades are not asked for a price.
- *Store:* no store, same acquisition rule. Fix: the existing store picker.
- *Date acquired:* no date. Fix: a date box.

**Every row** has "Leave blank" or "Not known", which records the decision per record and field, using the same
dismissal storage as duplicates and "Not on TTB", so it is not offered again.

**Skipped by the owner:** brands with no company (they can have none). Finishes are never suggested from siblings
(they differ by label on purpose).

**Size:** this section is two plans, reference data (distilleries, finishes, stores) first, then labels and bottles.

## Merge behaviour, revised against #343

- **Matching reuses `src/lib/bulk-editor/suggest.ts`** (`normalise`, `distance`, the "close match" rule), so this page
  and the autocompletes agree on what is a near-match. This replaces the separate scoring described under
  "Duplicates" above. Stores also weigh place: the same name in two places is not a duplicate (their unique key
  includes the place).
- **Before confirming, the page shows exactly what will move**, by kind (labels, bottles, tastings, links), not one
  label count.
- **Fields only the removed item has** (a distillery's location or DSP number, a store's place) are offered to the
  survivor to keep, never silently dropped.
- **A recorded summary of each merge** (what moved, when) is kept, so a mistaken merge can be reasoned about and
  repaired by hand. A true undo is not built. (My call; #343 allows "undo, or at least a recorded summary".)
- Not in scope: a creation-time "close match" hint when making new items (the bulk editor already does this for
  brand, label, store and cooperage).

## Left to the builder

Route and nav placement (the page is "Housekeeping"); the exact "no picture" rule once the grid's image logic is read;
whether any filler-word table is needed on top of `suggest.ts`, and the cutoff (tune against real data and show the
choice in the PR); the per-kind reference registry; the shape and migration of the one dismissal table that serves
duplicates, "Not on TTB" and "Leave blank / Not known"; how summary counts are computed (on open, or per tab on
demand); layout and keyboard handling of the photo cards and fix rows; the category rule for when Age applies; how a
label with complete releases but a blank own value is treated; what the recorded merge summary stores and where.

## Verification

Run against a scratch database seeded with near-duplicates, unpictured labels, unlinked labels and incomplete records,
and show test counts in the PRs; the opt-in integration suites and Playwright do not run in CI. Cover at least:
- Photos: the 600 px rule rejects a 300 px image and accepts a 900 px one, on this page only (the label page is
  unchanged); a private-address link is refused; a paste and a file drop both save; the tab for barrels saves to the
  bottle, vintages to the release; paging and per-page counts are right.
- Duplicates: merge relinks every reference for each kind; junction collisions collapse; the loser's fields are
  offered; a dismissed pair stays gone; the same name in two places is not a store duplicate; the merge summary is
  recorded.
- TTB: Printable-version and TTB-page links point at `colaFormUrl` and `colaDetailUrl`; "Not on TTB" stays gone;
  the printable form opens in a fresh tab without a session (verify live before building on it).
- Missing details: undisclosed distilleries and online stores are excluded; undisclosed-distillery labels are left out
  of mashbill and distillery gaps; gifts are not asked for a price; an accepted suggested distillery is saved as
  inferred; Enter saves and moves focus.
