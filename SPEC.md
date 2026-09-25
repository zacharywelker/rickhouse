# Spirits Collection Manager — Build Spec

A self-hosted web app for cataloguing a personal bourbon/rye/American whiskey
collection, extending later to rum and other spirits. Runs on Unraid via Docker
Compose. Individual accounts for a household, reached on the LAN or through a
reverse proxy (see M10).

Read `schema.sql` before writing any code. It is the source of truth for the
data model and it encodes decisions that are not negotiable (see Non-Goals).

---

## Stack

Locked. Do not substitute without asking.

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript, React Server Components |
| ORM | Drizzle ORM (schema generated from `schema.sql`, migrations via drizzle-kit) |
| Database | PostgreSQL 16 (separate container) |
| Styling | Tailwind CSS v4 + shadcn/ui (tooling locked; the visual direction is not — see Design direction) |
| Images | Local disk on a mounted volume, `sharp` for thumbnails. No S3, no MinIO. |
| Auth | Better Auth (username + admin plugins, Drizzle adapter): individual accounts, `admin`/`member` roles, database sessions. See M10. |
| Tables | TanStack Table for the grid view |
| Validation | Zod schemas shared between server actions and forms |

Data mutations go through Next.js **server actions**, not API routes. Expose a
read-only JSON API under `/api/` only where Milestone 5 needs it.

---

## Core data model concepts

Three ideas drive the whole design. Preserve them.

**1. Expression vs. bottle.** An `expression` is the product — Pursuit Double
Oak Spirit, Batch 2. It owns mashbill, proof, distillery, age, MSRP. A `bottle`
is the physical unit on the shelf — it owns price paid, store, date acquired,
fill level, open/closed. Buying a second one creates a second `bottle` row
pointing at the same `expression`. Never merge these into one table.

M7 moves the release identity (batch, single barrel, private selection) down
to the bottle. That sharpens this split rather than softening it: the
expression stays the product, and everything that varies barrel to barrel
lives on the bottle.

**2. Blends require many-to-many.** The reference bottle has three distilleries
and three mashbills. `expression_distilleries`, `expression_mashbills` and
`expression_finishes` are join tables with a `position` column. Never render or
store these as comma-separated text.

**3. Category-specific fields are sparse nullable columns.** Rum fields
(`still_type`, `estate`, `ester_gl`, …) live on `expressions` and are shown or
hidden based on `categories.field_group`. Do not create per-spirit tables, do
not use EAV, do not use JSONB.

---

## Milestones

Build these in order. Finish and verify each before starting the next. Commit
at the end of every milestone.

| | Milestone | Status |
|---|---|---|
| M1 | Foundation | ✅ Done |
| M2 | Configuration CRUD | ✅ Done |
| M3 | Expressions and bottles | ✅ Done — but see [Model revisions](#m7--model-revisions) |
| M4 | The fill gauge and the grid | ✅ Done |
| M5 | Entity pages and stats | ✅ Done |
| M6 | Polish | ✅ Done |
| M7 | Model revisions | ✅ Done |
| M8 | Interaction and wording | ✅ Done — except the t8ke wording, below |
| M9 | Tastings beyond the shelf | ▶ Next |

Finished milestones are struck through below. They stay in the document
because the revisions in M7 only make sense against what was actually built.

### ~~M1 — Foundation~~ ✅
- ~~`docker-compose.yml` with `app` and `db` services, named volumes for Postgres
  data and uploads, `.env.example` with every variable documented.~~
- ~~Drizzle schema mirroring `schema.sql` exactly, plus the initial migration.~~
- ~~Password login, session cookie, middleware protecting every route.~~
- ~~Health check at `/api/health` that verifies the DB connection.~~
- ~~**Done when:** `docker compose up` gives a running app, seeded with the
  Pursuit example from `schema.sql`, behind a login.~~

### ~~M2 — CRUD for the taxonomy~~ ✅

Shipped as **Configuration**; "taxonomy" was a database word.
- ~~Admin pages for categories, companies, brands, distilleries, mashbills,
  finishes, stores, tags.~~
- ~~Category editor must handle the self-referencing tree; companies must handle
  parent ownership chains.~~
- ~~Mashbill editor: percentage inputs with a live sum indicator that flags
  anything not totalling 100.~~
- ~~Inline "create new" from combobox pickers, so adding a bottle never requires
  leaving the form to go create a distillery first. This is important — it is
  the single biggest source of friction in this kind of app.~~
- ~~**Done when:** every lookup entity is manageable in the UI.~~

### ~~M3 — Expressions and bottles~~ ✅
- ~~Expression form with multi-select for distilleries, mashbills and finishes,
  each ordered and each supporting an optional share percentage.~~
- ~~Conditional field sections driven by `categories.field_group`: choosing a
  Bourbon category shows whiskey fields, Rum shows rum fields. Hidden fields
  must not be submitted or cleared silently.~~
- ~~Bottle form: expression picker, price, store, date acquired, acquisition type,
  location, status.~~
- ~~Bottle detail page at `/bottles/[id]`: hero image, all expression specs,
  linked entities as clickable chips, tasting notes, edit affordance.~~
- ~~Multi-image upload with drag-and-drop reorder, one designated primary,
  thumbnails generated on upload, files written to the uploads volume with
  UUID filenames.~~
- ~~**Done when:** the Pursuit bottle can be created start to finish through the
  UI and renders correctly on its own page.~~

### ~~M4 — The fill gauge and the grid~~ ✅
- ~~**Bottle fill component.** A custom SVG shaped like a whiskey bottle —
  shoulder, neck, body — with the liquid level rendered as a clipped fill that
  animates on change. Amber gradient. Draggable to set the level, plus a
  numeric input for precision. Used both as an editable control on the detail
  page and as a small read-only indicator in the grid. Build this as a
  standalone, well-isolated component; it is the visual centrepiece.~~
- ~~Open/closed toggle. Opening a bottle stamps `date_opened`. Setting fill to 0
  prompts to mark the bottle killed and stamps `date_killed`.~~
- ~~Grid view at `/bottles`: server-side sorting, filtering and pagination over
  the `bottle_list` view. Column visibility toggles. Filters for category,
  brand, distillery, finish, store, proof range, age range, status, open/closed,
  price range and tags. Filter state serialised to the URL so views are
  bookmarkable.~~
- ~~Gallery view toggle showing bottle images in a grid.~~
- ~~**Done when:** filtering by distillery returns every blend that distillery
  contributed to, not just single-distillery bottles.~~

### ~~M5 — Entity pages and stats~~ ✅
- ~~`/distilleries/[slug]`, `/brands/[slug]`, `/mashbills/[id]`,
  `/finishes/[slug]`, `/stores/[slug]`: each lists every bottle connected to it
  with a summary header (count, total spend, average proof, average rating).~~
  Each page is the M4 grid with a preset filter, so sorting, pagination and the
  gallery toggle all come for free. The preset is merged *after* the URL
  filters, so the entity can never be filtered away from its own page.
- ~~`/dashboard`: collection size, total spend, spend vs. MSRP delta, breakdown by
  category, proof distribution, acquisitions over time, open vs. unopened,
  top distilleries. Use Recharts.~~
- ~~Dashboard analytics, added after M4: what share of the collection is rye
  versus bourbon versus everything else, the most-used mashbill, the most-used
  distillery, the most-used finish. A dedicated analytics page can come later;
  the dashboard carries these now.~~
- ~~Tasting notes CRUD with nose/palate/finish/overall and a 0–10 rating.~~
- ~~CSV import and export for bottles.~~ Import creates brands, distilleries,
  finishes and stores as it meets them, but never categories — guessing where a
  spirit sits in the tree is how a taxonomy rots. Rows are reported one by one
  and nothing is rolled back, so a partial import is a usable import.
- ~~**Done when:** clicking Bardstown Bourbon Company from the Pursuit bottle
  lands on a page listing that bottle among its contributions.~~
- Nav renamed along the way, per the M4 feedback: Home, Collection, Expressions,
  Dashboard, Configuration.

Two charting decisions worth keeping: every chart has a **Table** toggle that
shows the same numbers as a real table (the chart is never the only way to read
the data), and the acquisitions line is **stepped, not smoothed** — a month's
count is discrete, and a curve between two months draws bottles that were never
bought.

### ~~M6 — Polish~~ ✅
- ~~Mobile-responsive throughout; the grid collapses to cards under 768px.
  Desktop functionality comes first, but the iPhone is a primary target, not an
  afterthought — it is where bottles actually get logged.~~ The nav was the
  real culprit: five links that would not wrap made *every* page 597px wide on
  a 390px screen. It collapses behind a disclosure now, the grid becomes cards,
  and the filter row hides behind a "Filters" button so bottles are above the
  fold. A test asserts zero horizontal overflow on every top-level page.
- ~~Light and dark both first-class, following the system by default with a
  manual override. Neither is the "real" theme.~~ Every token is declared once
  with `light-dark()`; `color-scheme` picks the half. The three-way toggle
  (System / Light / Dark) stamps `data-theme` on `<html>`, and an inline script
  in `<head>` applies a stored choice before first paint.
- ~~Keyboard shortcuts: `n` new bottle, `/` focus search, `esc` close dialogs.~~
  Escape is not a global handler — Radix closes its own dialogs and popovers,
  and the two hand-rolled disclosures handle their own. One global listener for
  all three would fight them.
- ~~Full-text search across brand, expression name, distillery and notes.~~ A
  weighted tsvector in the view, matched with `websearch_to_tsquery` so phrases
  and `-exclusion` work, OR'd with a substring match over the same corpus as
  plain text — full text cannot match a prefix, and nobody typing "goose"
  wants nothing on the way to "gooseberry".
- ~~Backup script that dumps Postgres and tars the uploads volume.~~
  `npm run backup`, with retention, an atomic write, and the restore commands
  printed against the archive it just made.

Two things worth keeping in mind later:

- **The search columns are computed in the view, so they cannot be indexed.**
  That is deliberate — the corpus spans six tables, and a stored copy is six
  ways to go stale. At a home collection's scale the sequential scan is
  microseconds. If that ever stops being true, materialise the view rather
  than scattering triggers.
- **Light mode is accessible, not designed.** It exists because M6 asked for
  both themes to be first-class, and every token passes contrast. The actual
  visual direction is still [Design direction](#design-direction), unscheduled.

### Barcodes

`expressions.upc` already exists in the schema. Two separate jobs:

- **Entry.** A UPC field on the expression form. Nothing special needed — a
  USB/Bluetooth barcode reader presents as a keyboard, types the digits and
  sends Enter, so a focused text input is the whole integration.
- **Lookup.** Scanning anywhere in the app jumps to that expression: found,
  offer to add another bottle of it; not found, start a new expression with the
  code prefilled. This is the workflow that makes a scanner worth owning, and
  it wants an index on `upc` (non-unique — relabels and regional variants do
  share codes).

A camera scan on mobile is a later progressive enhancement, degrading to manual
entry where unsupported. It is not a prerequisite for either of the above.


### ~~M7 — Model revisions~~ ✅

Feedback from actually using M3. Deliberately scheduled **after** M4 so the
fill gauge and the grid land first. Each of these is a migration plus form
work, not a rethink.

**Drop `bottles.estimated_value`.** Not tracking secondary pricing. The column
and its form field go.

**Move release identity from the expression to the bottle.** `batch`,
`release_year`, `is_single_barrel` and `is_single_barrel_pick` belong on the
bottle, not the product.

The reason is concrete: six private selections of the same Weller 12 are six
bottles of one expression, not six expressions. Under the current model each
pick forces a duplicate product, which is exactly the duplication the
expression/bottle split exists to prevent. This is not a retreat from that
split — it is putting the line in the right place. The expression stays the
product; everything that varies barrel to barrel moves down.

Consequences to handle in the migration:
- `expressions` currently has `UNIQUE (brand_id, name, batch)`. Without batch
  that becomes `UNIQUE (brand_id, name)`, and existing rows that differ only by
  batch have to be merged rather than dropped.
- The single-barrel detail block (`pick_name`, `picked_by`, `warehouse`,
  `rick_floor`, `barrel_filled_on`, `bottled_on`, `barrel_number`) moves with
  them.
- `bottle_list` and the grid's filters both reference these columns.

**Per-bottle proof and age, inherited when blank.** A single barrel or private
selection almost always differs from the standard release on exactly these two,
so ticking either reveals proof and age fields on the bottle. Left empty, they
fall back to the expression's values on save — displayed as inherited rather
than copied, so a later correction to the expression still flows through.

**Mashbill entry and display, reworked.**
- Grain order follows the spirit rather than the column order: a bourbon reads
  corn, rye, wheat, malted barley; a rye reads rye, corn, wheat, malted barley.
  Display and form both.
- An **add unusual grain** button, for oats, quinoa, triticale, spelt. Today
  there is a single `other_grain` plus `other_grain_name`, which handles one
  and only one. This needs either a `mashbill_grains` child table or a small
  fixed set of extra slots — the child table is the honest answer.
- When an expression lists two or more distilleries, each mashbill row should
  say which distillery it came from. `mashbills.distillery_id` already exists;
  this is surfacing it in context rather than new schema.

**Rename "expression".** The word is accurate in the whiskey world and wrong
in this app's voice — it reads like industry jargon where everything else
reads plainly. Undecided; candidates include Product, Release, Label, Bottling
and Spirit. Whatever it becomes is a rename of the user-facing strings and
optionally the `/expressions` route; the table name can stay.


**How M7 landed.** `estimated_value` is gone. Batch, release year, the
single-barrel flags and the whole pick block live on the bottle
(`drizzle/0005`), which merges labels that shared a brand and name — losslessly,
since each bottle carries its own batch down first, and anything the two rows
disagreed on beyond that is kept whole in `label_merge_log`. `npm run m7:preview`
reports what a given database would merge, before upgrading. Proof and age are
per-bottle overrides resolved in `bottle_list`, not copied on save, so
correcting a label still reaches every bottle that did not say otherwise.
Grains became rows (`drizzle/0006`) with the 99–101 tolerance as a DEFERRABLE
constraint trigger — a CHECK sees one row at a time and a recipe edit
necessarily passes through totals that are not 100. "Expression" is **Label**.

**Grain order, resolved differently to how this was written.** The spec asked
for order by spirit type. It is done by putting the dominant grain first and
then following the conventional written order, because the dominant grain *is*
what makes it that spirit (bourbon is ≥51% corn, rye ≥51% rye) and a mashbill
is shared across labels, so it has no one spirit type to look up. Sorting by
percentage alone was tried and is wrong: it reads 78/10/12 as corn, malted
barley, rye, which is not how anyone writes that recipe.

### Still open after M7/M8

- **The t8ke wording is unverified.** t8ke.com is blocked by this build
  environment's egress proxy, and the search result that describes the scale
  says explicitly that some of the descriptions belong to a *modified* version.
  The text is in `src/lib/t8ke.ts` and nowhere else, so correcting it is one
  edit. Check it against the source before trusting the tooltip.
- **`/expressions` is still the route** and `expression` is still the CSV
  column. The spec made the route optional; the CSV column is a data contract
  with files already exported, and renaming it would break re-importing them.
  The table name stays too, as planned.
- **The labels list sorts but has no filter bar.** M8 asked for "the same
  filter bar shape as bottles". It has server-side sorting in the URL; it does
  not have the entity filters, ranges or search. That is the M4 filter
  machinery applied to a second grid, and it is the one piece of M8 that is
  only part done.

### ~~M8 — Interaction and wording~~ ✅

Feedback from using M4. Small, mostly independent, and none of it structural.

**Rows open on double-click.** Hitting the expression link exactly is fiddly.
Double-clicking anywhere in a grid row should open that bottle. Keep the link
too — it is what makes middle-click and "open in new tab" work — and give the
row `cursor: pointer` so the affordance is visible.

**The opened date is editable.** Today opening a bottle stamps the date and
that is the end of it. Clicking the date should let you correct it, for the
bottle you opened three months ago and are only now logging.

**Distillation and bottling dates on the expression, with age derived.** There
are already `barrel_filled_on` and `bottled_on` in the single-barrel block.
Surface them generally, and offer to compute years/months/days from the pair
rather than making you work it out. Computed, not overwritten: a typed age
statement still wins.

**Title Case for field labels.** "Price paid" reads awkwardly beside "MSRP" and
"UPC". Labels become "Price Paid", "Date Acquired", "Age Statement". This is a
pass over the field specs, not a mechanism change.

**Navigation renamed.** "Bottles" becomes **Collection** — it is the thing
people mean — and today's "Collection" becomes **Home**. Landing on the wrong
one repeatedly is the tell.

**Ratings on the t8ke scale, explained in place.** The column is already
`numeric(3,1)` over 0–10, which is the right shape. What is missing is that the
scale is named and explained: hovering the Rating label should show what the
numbers mean, because a bare 0–10 invites a 90-point-scale mental model where
7 is mediocre. On t8ke's scale 5 is average and genuinely good.

> The canonical wording lives at t8ke.com, which was unreachable from the build
> environment. What is implemented is assembled from secondary sources and kept
> in one constant so it is a one-line correction. Verify it against the source
> before trusting the tooltip.

**Categories: "Field group" needs a better name.** It decides which specialist
fields an expression shows, and the values are whiskey / rum / agave / brandy.
**Spirit type** is the honest name. Rename the label; the column can stay.

**Categories: `sort_order` needs a purpose or a grave.** It controls the order
categories appear in pickers and lists — so Bourbon can sit above Rye rather
than falling alphabetically. If that is not worth the field, drop the column
and sort by name. Decide, then either explain it in help text or remove it.

**Expressions get the grid treatment.** Sortable columns, the same filter bar
shape as bottles. The machinery from M4 is reusable; this is mostly wiring.

---

### M9 — Tastings beyond the shelf ▶

A later add-on, recorded so the data model can see it coming.

Tasting notes hang off `bottles` today, which means you can only record what
you own. Most tasting happens elsewhere — a bottle share, a bar, someone's
kitchen. Those are worth keeping and they are exactly the ones you will forget.

The shape that probably works: let a tasting note attach to an **expression**
directly, with the bottle optional. A note then has a source — owned, bar,
bottle share, sample, store pour — and a "tasted at" field. Nothing already
recorded has to move.

With that in place, a **tastings timeline** becomes possible: everything you
have tried, newest first, owned or not, with the ratings alongside. That is a
different and more interesting page than a list of what is on the shelf.

### M10 — Accounts ▶

Replaces the single shared `APP_PASSWORD`. The plan and the decisions behind
it live in issue #48; the phases, in order:

1. ~~**Accounts.** Better Auth with database sessions and serial ids. Sign in
   with username or email. Roles are `admin` and `member`; admins manage
   accounts but cannot sign in as anyone or see their collections. First run
   creates an admin with a generated password printed to the container log;
   generated passwords (first run, `dist/reset-password.mjs`, new accounts)
   must be replaced at first sign-in. Deactivation revokes every session.
   Sign-in and password changes are rate limited per client IP.~~
2. ~~**Private collections.** `owner_id` on bottles, groups and every catalog
   table except `categories`; names and slugs unique per owner; existing data
   goes to the first admin; new accounts start empty. Postgres keeps owners
   apart (composite foreign keys, and a trigger on the link tables), and every
   query, ID-taking action, upload and photo is scoped to the signed-in
   account. Categories stay shared and admin-edited. Account settings (name,
   username, password) and the admin pages (Users, Backups) live in the menu
   under your first name, top right.~~
3. **Email.** SMTP configured in the admin panel: password reset,
   invitations, security notices. "Forgot password" appears only once it is set.
4. **Single sign-on.** OIDC providers (Pocket ID, Authentik, Google, …)
   configured in the admin panel, linked from a signed-in account; never
   matched by email, never creating accounts.
5. **2FA and passkeys.**

---

## Deployment

Two containers. The app listens on 1964, mapped to a host port. Postgres is not
exposed to the host network.

Unraid conventions to follow:
- Uploads volume maps to a host path supplied via env (`/mnt/user/appdata/...`
  is a typical value, but never hardcode it).
- Postgres data likewise.
- The app container runs as a non-root user; document the PUID/PGID handling in
  the README so file ownership on the Unraid share is correct.
- Multi-stage Dockerfile using the Next.js `standalone` output. Target image
  under 300MB.
- `README.md` with setup, env vars, backup/restore, and an Unraid-specific
  section.

---

## Design direction

Recorded so the eventual redesign has a brief. **Not yet scheduled** — the
theme is a decision for later, deliberately deferred.

The current look (dark, wood, fireplace) is a placeholder and is not the
direction. What is wanted instead:

- **Modern and at home next to Apple software.** Depth, translucency and
  material rather than flat panels on a flat background.
- **Personality.** It should be fun to open. A collection app for a hobby
  should not read like an admin console.
- **Light and dark as equals**, following the system by default.
- **Data-dense views done well.** Airtable, Baserow and NocoDB are the
  reference for how the grid, filters and inline editing should feel — that
  part is a solved problem worth learning from rather than reinventing.
- **Accessible, and tested for it.** WCAG 2.2 AA as the floor: contrast,
  visible focus, keyboard reachability, honouring `prefers-reduced-motion`,
  and correct roles and names throughout.

"Liquid glass" means Apple's design language specifically, not frosted panels
generically: layered translucent material, depth by layering rather than drop
shadows, concentric radii, motion as continuity.

The supplied references — the Tropical, Suprematism and Kinetic Flux styles
from ggprompts.com — are decoded with their real tokens, a recommended
synthesis and the contrast maths for every colour in
**[docs/DESIGN.md](docs/DESIGN.md)**. Start there rather than from the names.

**One tension to resolve up front.** Translucency and accessible contrast pull
against each other: text over a blurred backdrop has a contrast ratio that
changes with whatever is behind it. Glass stays on chrome — bars, sheets, card
edges — and text sits on a solid layer within it, never directly over the blur.
Apple ships the same aesthetic behind Reduce Transparency and Increase
Contrast; the web equivalents (`prefers-reduced-transparency`,
`prefers-contrast`, `prefers-reduced-motion`) are what make it shippable rather
than a compromise. See docs/DESIGN.md.

---

## Conventions

- Strict TypeScript. No `any`. No non-null assertions without a comment.
- Server components by default; `"use client"` only where interactivity needs it.
- Every mutation validated with Zod on the server, regardless of client checks.
- Money as `numeric` in Postgres, handled as integer cents or Decimal in TS —
  never as a float.
- Dates without time (acquired, opened, killed) are `date`, not `timestamptz`.
- Slugs generated on create, editable, unique-checked.
- Soft empty states everywhere: a new install should be navigable and explain
  what to do next, not show blank tables.
- Vitest for utility and validation logic. Playwright for one end-to-end path:
  log in, create a bottle, set its fill level, filter for it in the grid.

---

## Non-Goals

Do not build these, and do not restructure the schema to accommodate them:

- Sharing collections between accounts, or social features. (Accounts and
  roles are M10.)
- Price scraping, market valuation, or any third-party API integration.
  M7 drops `bottles.estimated_value` for the same reason: this is a collection,
  not a portfolio.
- Mobile native apps.
- Merging `expressions` and `bottles` "for simplicity".
- Replacing the join tables with text columns.
- Swapping Postgres for SQLite.
- An LLM/vision label reader. Possible later; out of scope now.

---

## First instruction to Claude Code

> Read SPEC.md and schema.sql. Ask me anything ambiguous before writing code.
> Then implement Milestone 1 only, and stop so I can verify it.
