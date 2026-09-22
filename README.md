# Rickhouse

A bottle tracker for the crazy home enthusiast of whiskey, rum, and spirits of
all types. Self-hosted, two Docker containers, meant to live on an Unraid box
next to everything else.

Every bottle gets its own page. Brands, distilleries, mashbills, finishes and
stores are real linked records rather than free text, so "show me everything
Bardstown distilled" works even when the bottle is a three-way blend.

> **Status: Milestone 6 (Polish).** Mobile, light and dark, keyboard
> shortcuts, full-text search and backups are done and verified. Next is M7,
> the model revisions that came out of actually using it — see
> [SPEC.md](SPEC.md).

---

## What is in here

| File | What it is |
|---|---|
| `SPEC.md` | The build plan: stack, data model rules, milestones, non-goals. |
| `docs/UNRAID.md` | Step-by-step Unraid deployment. |
| `docs/DESIGN.md` | Design brief: reference tokens, synthesis, contrast maths. |
| `docker-compose.yml` | Runs the published image. `docker-compose.build.yml` overrides it to build from source. |
| `.github/workflows/publish.yml` | Builds the image and pushes it to GHCR on every push to `main`. |
| `schema.sql` | Source of truth for the data model, annotated. |
| `src/db/schema.ts` | Drizzle mirror of `schema.sql`. Keep the two in lockstep. |
| `src/lib/admin/registry.ts` | Every lookup entity described once — fields, columns, queries. |
| `drizzle/` | Generated migrations. `0001` adds the `bottle_list` view by hand. |
| `scripts/` | `migrate.ts` and `seed.ts`, both idempotent, both run at container start; `backup.sh` for dumps. |

---

## Quick start

```sh
cp .env.example .env
# edit .env: at minimum POSTGRES_PASSWORD, APP_PASSWORD and SESSION_SECRET
openssl rand -hex 32          # paste into SESSION_SECRET

docker compose up -d
```

That pulls the prebuilt image from GHCR. To build from source instead:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Then open `http://<host>:1964` and sign in with `APP_PASSWORD`.

On first start the app creates its schema and seeds the category tree plus one
example bottle — Pursuit Spirits Double Oak Spirit, the three-distillery blend
from the spec — so nothing is a blank page. Delete it once you have your own;
the seed only fires while the collection is empty, so it will not come back.

### Environment variables

Every variable is documented in [`.env.example`](.env.example). The ones you
must set:

| Variable | Why |
|---|---|
| `POSTGRES_PASSWORD` | Database password. Set before the first start. |
| `APP_PASSWORD` | The single shared password for the app. 8 characters minimum. |
| `SESSION_SECRET` | HMAC key for the session cookie. 32 characters minimum; `openssl rand -hex 32`. |

`RICKHOUSE_TAG` picks which published image to run. It defaults to `latest`,
which follows `main`; pin a `sha-…` or version tag to update deliberately.

Worth knowing:

- **`COOKIE_SECURE`** defaults to `false` because most Unraid boxes are reached
  over plain HTTP on the LAN. Set it to `true` only once you are behind HTTPS —
  on plain HTTP a secure cookie is never sent back, which shows up as "login
  does nothing".
- **`RUN_MIGRATIONS` / `RUN_SEED`** default to `true` and are safe to leave on.
  Set them to `false` if you would rather run `npm run db:migrate` yourself.

---

## Unraid

**[docs/UNRAID.md](docs/UNRAID.md) is the step-by-step install** — plugin,
where to put the source, the stack, first build. What follows here is the
reference for the pieces it uses.

### Paths

Point the two volume variables at your appdata share:

```
POSTGRES_DATA_PATH=/mnt/user/appdata/rickhouse/postgres
UPLOADS_PATH=/mnt/user/appdata/rickhouse/uploads
```

Both are bind mounts, so backing Rickhouse up is backing up those two folders
(plus a `pg_dump`, see below).

### File ownership (PUID / PGID)

Unraid's shares are owned by `nobody:users`, which is uid `99`, gid `100`. The
app image starts as root only long enough to align its `node` user with
`PUID`/`PGID` and chown the uploads directory, then drops privileges with
`su-exec` before Next.js starts. The defaults in `.env.example` are already
`99` and `100`.

Get this wrong and bottle photos land on the share owned by a uid that Unraid's
file manager and SMB cannot write, which looks like "I can upload images but
not delete them".

### Ports and networking

The app publishes `APP_PORT` (default 1964). Postgres deliberately publishes
nothing — only the app container can reach it, over the compose network. If you
want to poke at the database, exec into it rather than exposing the port:

```sh
docker compose exec db psql -U rickhouse -d rickhouse
```

### Reverse proxy

If you front the app with SWAG/NPM/Caddy, terminate TLS there, forward to the
app's port, and set `COOKIE_SECURE=true`.

---

## Where your data lives

Postgres runs as its own container (`rickhouse-db`), separate from the app. It
is a stock `postgres:16-alpine` image with no Rickhouse code in it — the app
holds no data of its own.

That separation is deliberate, and it means the failure modes are independent:

| If this breaks | Your data |
|---|---|
| The app container crashes or won't start | Untouched. Postgres keeps serving. |
| A bad release ships a bug | Untouched. Roll the app image back. |
| A migration goes wrong | Restore the dump; the app is unchanged. |
| You delete the app container entirely | Untouched. It owns nothing. |

Both data directories are **bind mounts to host paths you choose**, not Docker
named volumes:

```
POSTGRES_DATA_PATH=/mnt/user/appdata/rickhouse/postgres   # the database files
UPLOADS_PATH=/mnt/user/appdata/rickhouse/uploads          # bottle photos
```

So your collection is two folders on your Unraid array that you can browse,
snapshot and include in your existing backup routine. Nothing is locked inside
a container. `docker compose down -v` — the command that wipes named volumes —
does not touch either path.

If you would rather point Rickhouse at a Postgres you already run, delete the
`db` service from `docker-compose.yml` and set `DATABASE_URL` to your own
instance. The app only needs a database it can create its schema in.

---

## Updating a deployment

`docker compose up -d` does **not** pull a newer image — Compose only pulls
when the tag is missing locally, and tags are mutable pointers it does not
re-check. Updating is always:

```sh
docker compose pull && docker compose up -d
```

On Unraid, the Compose Manager **Update Stack** action does both; plain
**Compose Up** does not. See [docs/UNRAID.md](docs/UNRAID.md#updating).

---

## Backup and restore

```sh
npm run backup                              # -> ./backups/rickhouse-<timestamp>/
BACKUP_DIR=/mnt/user/backups npm run backup # somewhere your parity plan covers
```

`scripts/backup.sh` dumps the database through the `db` container, tars the
uploads directory, and prints the restore commands for the archive it just
made. See [Backups](#backups) for retention and the safety properties.

By hand, if you would rather:

```sh
docker compose exec -T db pg_dump -U rickhouse -Fc rickhouse > rickhouse-$(date +%F).dump
tar czf rickhouse-uploads-$(date +%F).tar.gz -C /mnt/user/appdata/rickhouse uploads

docker compose exec -T db pg_restore -U rickhouse -d rickhouse --clean --if-exists < rickhouse-2026-01-01.dump
tar xzf rickhouse-uploads-2026-01-01.tar.gz -C /mnt/user/appdata/rickhouse
```

### Changing the database password

`POSTGRES_PASSWORD` only takes effect when the data directory is first created.
Editing it later changes what the app *sends*, not what Postgres *expects*, so
the app will fail to connect. Change it in both places:

```sh
docker compose exec db psql -U rickhouse -c "ALTER USER rickhouse WITH PASSWORD 'new-password';"
# then update POSTGRES_PASSWORD in .env
docker compose up -d
```

---

## Health check

`GET /api/health` is the one unauthenticated route. It verifies the database
connection and reports connectivity only, never collection data:

```json
{ "status": "ok", "database": "up" }
```

It returns `503` when the database is unreachable, and it backs the container's
`HEALTHCHECK`, so `docker compose ps` tells you whether the app is genuinely
serving or merely running.

---

## Configuration

`/admin` manages the eight lookup entities that everything else links to:
categories, companies, brands, distilleries, mashbills, finishes, stores and
tags.

It is registry-driven. Each entity is described once in
`src/lib/admin/registry.ts` — its form fields, its table columns, how to list
it and how to save it — and a single dynamic route renders all eight. Adding a
ninth is a registry entry, not a new page.

Three things there are worth knowing about:

**Inline create.** Any picker that points at another entity can create one
without leaving the form. Type a distillery that does not exist yet and the
dropdown offers to make it. The spec calls this out as the single biggest
source of friction in this kind of app, and it is the reason adding a bottle
never turns into a detour.

**The mashbill editor** totals the grains as you type. The bar is amber at
100%, gold inside the 99–101% tolerance the database allows (published
mashbills are often rounded), and red outside it. A bad total is rejected
before it reaches Postgres.

**Loops are prevented in both directions.** Categories and companies are
self-referencing, so the parent picker hides the row itself and everything
beneath it, and the server re-checks the parent chain before saving. A
mis-click cannot strand a subtree.

Deleting is blocked where the database would block it, with a message naming
what is in the way — "1 expression uses this brand" — rather than a foreign key
error.

---

## Expressions and bottles

The split the whole data model turns on:

- An **expression** is the product — mashbill, proof, distillery, MSRP. Two
  batches of the same name are two expressions.
- A **bottle** is the physical unit on your shelf — price paid, store, date
  acquired, fill level. Buying a second one adds a bottle, not a product.

The expression form shows sections by the chosen category's field group: a
Bourbon gets the process fields, a Rum gets still type, marque and esters.
Ticking single barrel or private selection reveals the pick fields — who
picked it, the warehouse, the fill and bottling dates.

**Hiding never clears.** Recategorise a rum as a bourbon and the rum columns
are simply left out of the update rather than nulled, so the ester count is
still there if you switch back.

Distilleries, mashbills and finishes attach as ordered lists with a share
percentage each, because a blend of three has three of them and the order is
meaningful.

### Photos

Uploads are re-encoded to WebP on the way in, which normalises HEIC from an
iPhone, applies the orientation tag, and strips EXIF — including GPS. Files are
named with UUIDs and written to the uploads volume, so nothing derived from the
upload's own filename ever reaches the disk. A thumbnail is generated
alongside. They are served through `/api/images/…`, behind the session, and
every path is resolved against the uploads root before being read.

### Barcodes

`expressions.upc` takes a scanned code — a handheld reader presents as a
keyboard, so it types straight into the field with no integration to write.
The column is indexed for lookup; scan-to-jump arrives with the grid.

---

## The grid

`/bottles` filters, sorts and pages **in Postgres**, not in the browser, and
every bit of that state lives in the URL — so a view you like is a bookmark,
and the back button does what you expect.

Entity filters match through the join tables rather than against the view's
flattened name strings. That is the difference between filtering by Bardstown
and getting only the bottles it made alone, and getting every blend it
contributed to. Category filters walk down the tree, so filtering by Whiskey
finds your bourbons.

Columns can be hidden, the gallery shows the same filtered set as photos, and
the summary strip totals whatever is currently matched rather than the whole
collection.

## The fill gauge

A bottle you can pour: one SVG path for the lip, neck, shoulder and body, with
the liquid clipped to that outline so the level narrows through the shoulder
the way it does in real glass.

Drag it, or use the keyboard — it is a real `slider`, so arrows nudge by one,
shift-arrows by ten, and Home and End empty and fill it. Writes are debounced,
because dragging produces a value on every pointer move.

Reaching empty offers to mark the bottle killed, which stamps the date. Opening
one stamps `date_opened` the first time and promotes the status. The same
component renders read-only at 34px in the grid, so the two can never drift.

## Entity pages

Every linked record has a page: `/distilleries/[slug]`, `/brands/[slug]`,
`/finishes/[slug]`, `/stores/[slug]` and `/mashbills/[id]`. Each one is the
grid above with a filter already applied, so sorting, paging, column choices
and the gallery toggle all behave exactly as they do on `/bottles`.

The preset is merged *after* whatever is in the URL, which means you can filter
a distillery page down to its open bottles, but you cannot accidentally filter
the distillery out of its own page.

Chips on a bottle page link here — the brand under the title, the store in the
spec grid, and every distillery, mashbill and finish.

## The dashboard

`/dashboard` answers the questions a shelf cannot: what share of the collection
is rye, which mashbill you keep buying, which distillery you actually own the
most of, how much you are over MSRP, and what you bought when.

Two rules the charts follow:

- **Every chart has a Table toggle.** Colour and length are the fast read, but
  the same numbers are always one click away as a real table — so the chart is
  never the only way to get at the data.
- **The acquisitions line is stepped, not smoothed.** A month's count is a
  discrete number. A curve between two months would draw bottles that were
  never bought.

## CSV import and export

`/bottles/import` takes a file or pasted rows; the Export button on the
collection page emits exactly the same columns, so the fastest way to get a
template is to export what you have.

Only `brand`, `expression` and `category` are required, and list columns
(`distilleries`, `finishes`) take semicolons. Brands, distilleries, finishes
and stores are created as they are encountered. Categories are **not** — a
category is a position in a tree, and guessing at that is how a taxonomy rots,
so an unknown one fails its row and says so.

Nothing is rolled back. Every row reports its own outcome, so a partial import
is a usable import: fix the rows that failed and run them again.

## Light, dark, and the phone

Both themes are first-class. The app follows your system by default, and the
toggle in the header (System / Light / Dark) overrides it in either direction.
The choice is remembered per browser and applied by an inline script before
first paint, so a stored light theme never flashes dark on the way in.

Under the hood every token is declared once with CSS `light-dark()` and
`color-scheme` picks the half — there is no duplicated dark block to drift.

On a phone the nav collapses behind a menu, the grid becomes cards, and the
filter row hides behind a **Filters** button so bottles are on screen without
scrolling. The card keeps the fill gauge, because it is still the fastest read
on the page.

Light mode is accessible rather than designed: every colour passes contrast,
but the real visual direction is still the brief in
[docs/DESIGN.md](docs/DESIGN.md), deliberately unscheduled.

## Keyboard

| Key | Does |
|---|---|
| `/` | Focus the search box. From a page without one, goes to the collection. |
| `n` | New bottle. |
| `esc` | Closes whatever is open — dialogs, popovers, the nav and filter panels. |

Neither `/` nor `n` fires while you are typing in a field, and neither steals a
browser chord.

## Search

The search box runs two matches at once and returns anything either finds.

A **weighted tsvector** covers the brand, expression, batch, age statement,
category, store, distilleries, finishes, the expression's description, the
bottle's notes and every tasting note on it. The name of the thing outranks
what someone wrote about it. Because it is `websearch_to_tsquery`, quoted
phrases, `OR` and `-exclusion` all work, and it stems — "barrels" finds
"barrel".

A **substring match** runs beside it over the identical corpus as plain text,
because full text cannot match a prefix and nobody typing "goose" wants
nothing on the way to "gooseberry".

Sorting is left alone when you search. The grid's sort is yours; quietly
switching to relevance because a box has text in it loses people their place.

Both columns are computed in the `bottle_list` view, so they are never stale —
and cannot be indexed. That is the right trade at a home collection's scale;
`schema.sql` says what to do if it ever stops being.

## Backups

```bash
npm run backup                      # -> ./backups/rickhouse-<timestamp>/
BACKUP_DIR=/mnt/user/backups npm run backup
BACKUP_KEEP=30 npm run backup       # keep the 30 newest
```

Dumps the database through the `db` container and tars the uploads directory.
It writes to a `.partial` directory and renames at the end, so an interrupted
run never leaves something that looks like a usable backup, and it prints the
exact restore commands for the archive it just made.

Point `BACKUP_DIR` at a share that is part of your actual backup plan. The
default lives next to the data it is protecting, which is not a backup.

---

## The published image

`.github/workflows/publish.yml` builds `ghcr.io/zacharywelker/rickhouse` on
every push to `main` and on `v*` tags, and pushes it to GitHub Container
Registry. Pull requests build the image but do not push, which catches a broken
Dockerfile or a type error before it reaches `latest`.

Tags:

| Tag | Points at |
|---|---|
| `latest` | the tip of `main` |
| `sha-1a2b3c4` | one specific commit |
| `1.2.0`, `1.2` | a `v1.2.0` git tag, once you cut releases |

The image is `linux/amd64` only — Unraid is x86-64, and adding `arm64` roughly
triples the build for no one's benefit. Add the platform to the workflow if
that changes.

**New GHCR packages are private by default.** Until you make the package public
(or log your server into `ghcr.io`), `docker pull` fails with `denied`. See
[step 0 of the Unraid guide](docs/UNRAID.md#0-make-the-image-pullable).

---

## Development

Postgres in Docker, the app on your machine:

```sh
npm install
docker compose up -d db          # database only
cp .env.example .env.local       # point DATABASE_URL at localhost:5432
npm run db:migrate
npm run db:seed
npm run dev
```

The dev server listens on 1964, same as the container.

For that to work, publish the database port locally — either add a `ports:`
entry to the `db` service in a `docker-compose.override.yml`, or run Postgres
however you normally do and set `DATABASE_URL` to match.

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server. |
| `npm run build` | Production build (`standalone` output). |
| `npm run typecheck` | `tsc --noEmit`. Strict, no `any`. |
| `npm test` | Vitest: formatting, slugs, session signing. |
| `npm run test:e2e` | Playwright against a running app (`E2E_BASE_URL`, `E2E_APP_PASSWORD`). |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts`. |
| `npm run db:migrate` | Apply migrations. |
| `npm run db:seed` | Seed the category tree (and the example, if empty). |
| `npm run db:reset` | Empty every table and re-seed. Refuses to run against a remote host. |
| `npm run db:studio` | Drizzle Studio against the configured database. |

### Changing the data model

1. Edit `schema.sql` — it is the annotated source of truth.
2. Mirror the change in `src/db/schema.ts`.
3. `npm run db:generate` and review the SQL it produced.
4. `npm run db:migrate`.

Two rules from the spec are load-bearing and should survive any refactor:
`expressions` (the product) stay separate from `bottles` (the physical unit),
and distilleries, mashbills and finishes stay many-to-many with a `position`
column — a blend of three distilleries is three rows, never a comma-separated
string.

---

## Architecture notes

**Auth** is a single shared password from `APP_PASSWORD`, exchanged for an
HMAC-signed httpOnly cookie. No user table, no OAuth. Middleware runs on the
Node runtime rather than Edge, because the Edge bundler inlines `process.env`
at build time and this image is built once and configured at run time.

**Money** is `numeric` in Postgres and a string all the way through TypeScript.
It is never parsed into a float, so `$8,899.29` stays `$8,899.29`.

**The `bottle_list` view** flattens the many-to-many joins into the columns the
grid needs. It is created by a hand-written migration because drizzle-kit does
not round-trip the correlated sub-selects.
