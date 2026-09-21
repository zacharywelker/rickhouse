# Rickhouse

A bottle tracker for the crazy home enthusiast of whiskey, rum, and spirits of
all types. Self-hosted, two Docker containers, meant to live on an Unraid box
next to everything else.

Every bottle gets its own page. Brands, distilleries, mashbills, finishes and
stores are real linked records rather than free text, so "show me everything
Bardstown distilled" works even when the bottle is a three-way blend.

> **Status: Milestone 1 (Foundation).** Database, migrations, seed, login and
> health check are done and verified. The taxonomy admin, bottle pages, fill
> gauge and grid are the next milestones — see [SPEC.md](SPEC.md).

---

## What is in here

| File | What it is |
|---|---|
| `SPEC.md` | The build plan: stack, data model rules, milestones, non-goals. |
| `docs/UNRAID.md` | Step-by-step Unraid deployment. |
| `schema.sql` | Source of truth for the data model, annotated. |
| `src/db/schema.ts` | Drizzle mirror of `schema.sql`. Keep the two in lockstep. |
| `drizzle/` | Generated migrations. `0001` adds the `bottle_list` view by hand. |
| `scripts/` | `migrate.ts` and `seed.ts`, both idempotent, both run at container start. |

---

## Quick start

```sh
cp .env.example .env
# edit .env: at minimum POSTGRES_PASSWORD, APP_PASSWORD and SESSION_SECRET
openssl rand -hex 32          # paste into SESSION_SECRET

docker compose up -d --build
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

## Backup and restore

```sh
# Backup: database + uploaded images
docker compose exec -T db pg_dump -U rickhouse -Fc rickhouse > rickhouse-$(date +%F).dump
tar czf rickhouse-uploads-$(date +%F).tar.gz -C /mnt/user/appdata/rickhouse uploads

# Restore
docker compose exec -T db pg_restore -U rickhouse -d rickhouse --clean --if-exists < rickhouse-2026-01-01.dump
tar xzf rickhouse-uploads-2026-01-01.tar.gz -C /mnt/user/appdata/rickhouse
```

A scripted version of this lands in Milestone 6.

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
| `npm run db:seed` | Seed the taxonomy (and the example, if empty). |
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
