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
| Styling | Tailwind CSS v4 + shadcn/ui |
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

### M1 — Foundation
- `docker-compose.yml` with `app` and `db` services, named volumes for Postgres
  data and uploads, `.env.example` with every variable documented.
- Drizzle schema mirroring `schema.sql` exactly, plus the initial migration.
- Password login, session cookie, middleware protecting every route.
- Health check at `/api/health` that verifies the DB connection.
- **Done when:** `docker compose up` gives a running app, seeded with the
  Pursuit example from `schema.sql`, behind a login.

### M2 — CRUD for the taxonomy
- Admin pages for categories, companies, brands, distilleries, mashbills,
  finishes, stores, tags.
- Category editor must handle the self-referencing tree; companies must handle
  parent ownership chains.
- Mashbill editor: percentage inputs with a live sum indicator that flags
  anything not totalling 100.
- Inline "create new" from combobox pickers, so adding a bottle never requires
  leaving the form to go create a distillery first. This is important — it is
  the single biggest source of friction in this kind of app.
- **Done when:** every lookup entity is manageable in the UI.

### M3 — Expressions and bottles
- Expression form with multi-select for distilleries, mashbills and finishes,
  each ordered and each supporting an optional share percentage.
- Conditional field sections driven by `categories.field_group`: choosing a
  Bourbon category shows whiskey fields, Rum shows rum fields. Hidden fields
  must not be submitted or cleared silently.
- Bottle form: expression picker, price, store, date acquired, acquisition type,
  location, status.
- Bottle detail page at `/bottles/[id]`: hero image, all expression specs,
  linked entities as clickable chips, tasting notes, edit affordance.
- Multi-image upload with drag-and-drop reorder, one designated primary,
  thumbnails generated on upload, files written to the uploads volume with
  UUID filenames.
- **Done when:** the Pursuit bottle can be created start to finish through the
  UI and renders correctly on its own page.

### M4 — The fill gauge and the grid
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
- Dark mode, default on.
- Keyboard shortcuts: `n` new bottle, `/` focus search, `esc` close dialogs.
- Full-text search across brand, expression name, distillery and notes.
- Barcode/UPC field with a camera scan on mobile (progressive enhancement —
  degrade to manual entry where unsupported).
- Backup script that dumps Postgres and tars the uploads volume.

---

## Deployment

Two containers. The app listens on 3000, mapped to a host port. Postgres is not
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
- Mobile native apps.
- Merging `expressions` and `bottles` "for simplicity".
- Replacing the join tables with text columns.
- Swapping Postgres for SQLite.
- An LLM/vision label reader. Possible later; out of scope now.

---

## First instruction to Claude Code

> Read SPEC.md and schema.sql. Ask me anything ambiguous before writing code.
> Then implement Milestone 1 only, and stop so I can verify it.
