# Spirits Collection Manager — Build Spec

A self-hosted web app for cataloguing a personal bourbon/rye/American whiskey
collection, extending later to rum and other spirits. Runs on Unraid via Docker
Compose. Single household user, LAN-only, no multi-tenancy.

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
| Auth | Single shared password from env var, signed httpOnly cookie session. No NextAuth, no OAuth, no user table. |
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
| M4 | The fill gauge and the grid | ▶ In progress |
| M5 | Entity pages and stats | Planned |
| M6 | Polish | Planned |
| M7 | Model revisions | Planned — from using M3 in anger |

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

### M4 — The fill gauge and the grid ▶
- **Bottle fill component.** A custom SVG shaped like a whiskey bottle —
  shoulder, neck, body — with the liquid level rendered as a clipped fill that
  animates on change. Amber gradient. Draggable to set the level, plus a
  numeric input for precision. Used both as an editable control on the detail
  page and as a small read-only indicator in the grid. Build this as a
  standalone, well-isolated component; it is the visual centrepiece.
- Open/closed toggle. Opening a bottle stamps `date_opened`. Setting fill to 0
  prompts to mark the bottle killed and stamps `date_killed`.
- Grid view at `/bottles`: server-side sorting, filtering and pagination over
  the `bottle_list` view. Column visibility toggles. Filters for category,
  brand, distillery, finish, store, proof range, age range, status, open/closed,
  price range and tags. Filter state serialised to the URL so views are
  bookmarkable.
- Gallery view toggle showing bottle images in a grid.
- **Done when:** filtering by distillery returns every blend that distillery
  contributed to, not just single-distillery bottles.

### M5 — Entity pages and stats
- `/distilleries/[slug]`, `/brands/[slug]`, `/mashbills/[id]`,
  `/finishes/[slug]`, `/stores/[slug]`: each lists every bottle connected to it
  with a summary header (count, total spend, average proof, average rating).
- `/dashboard`: collection size, total spend, spend vs. MSRP delta, breakdown by
  category, proof distribution, acquisitions over time, open vs. unopened,
  top distilleries. Use Recharts.
- Tasting notes CRUD with nose/palate/finish/overall and a 0–10 rating.
- CSV import and export for bottles.
- **Done when:** clicking Bardstown Bourbon Company from the Pursuit bottle
  lands on a page listing that bottle among its contributions.

### M6 — Polish
- Mobile-responsive throughout; the grid collapses to cards under 768px.
  Desktop functionality comes first, but the iPhone is a primary target, not an
  afterthought — it is where bottles actually get logged.
- Light and dark both first-class, following the system by default with a
  manual override. Neither is the "real" theme.
- Keyboard shortcuts: `n` new bottle, `/` focus search, `esc` close dialogs.
- Full-text search across brand, expression name, distillery and notes.
- Backup script that dumps Postgres and tars the uploads volume.

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


### M7 — Model revisions

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

- Multi-user accounts, roles, sharing, or social features.
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
