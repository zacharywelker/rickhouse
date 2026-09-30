# Rickhouse

**A field guide to your liquor collection.**

Rickhouse is a self-hosted bottle tracker for whiskey, rum, agave, gin and whatever else is on the shelf.

It keeps the **label** (the product: brand, distillery, mashbill, proof, MSRP) separate from the **bottle** (the one you own: where and when you bought it, what you paid, batch or barrel, fill level, photos). Brands, distilleries, mashbills, finishes and stores are linked records, so "everything Bardstown distilled" works even when Bardstown is one part of a three-distillery blend.

- **Collection**: a dense grid and a gallery, searchable and sortable, with a fill level on every bottle
- **Labels**: the product reference behind each bottle, with its TTB label approvals: approved label art and bottler details, found by searching TTB's registry
- **Groups**: hand-picked sets like trips, gifts or favorites
- **Numbers**: what you buy, what you spend and what you keep coming back to, each linked to its bottles
- **Accounts**: a private collection per person, with optional single sign-on, two-step sign-in, passkeys and a Cloudflare Turnstile bot check
- **Backups**: scheduled from inside the app, with a plain-CSV copy you can read without Rickhouse

## Install

Rickhouse runs as two containers, the app and PostgreSQL. On Unraid, follow **[docs/UNRAID.md](docs/UNRAID.md)**. Anywhere else with Docker:

```sh
mkdir rickhouse && cd rickhouse
curl -fsSLO https://raw.githubusercontent.com/zacharywelker/rickhouse/main/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/zacharywelker/rickhouse/main/.env.example
# In .env, set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
docker compose up -d
docker logs rickhouse-app   # prints the admin password on first start
```

Open `http://<host>:1964` and sign in as `admin` with that password. You'll be asked to pick your own.

Every setting is documented in [`.env.example`](.env.example).

## Development

The compose database doesn't expose a port, so run Postgres locally for development:

```sh
npm install
docker run -d --name rickhouse-dev-db -p 5432:5432 \
  -e POSTGRES_USER=rickhouse -e POSTGRES_PASSWORD=rickhouse postgres:16-alpine
export DATABASE_URL=postgres://rickhouse:rickhouse@localhost:5432/rickhouse
export SESSION_SECRET=$(openssl rand -hex 32)
npm run db:migrate && npm run db:seed && npm run auth:bootstrap
npm run dev   # http://localhost:1964
```

Before a PR: `npm run typecheck && npm run lint && npm test`.

## Docs

| File | Contents |
| --- | --- |
| [`docs/UNRAID.md`](docs/UNRAID.md) | Installing, updating, backups and troubleshooting |
| [`SPEC.md`](SPEC.md) | Product spec, data model rules and milestones |
| [`DESIGN.md`](DESIGN.md) | Visual and interaction design system |
| [`docs/DESIGN-TOKENS.md`](docs/DESIGN-TOKENS.md) | Implementation-level design tokens |
| [`schema.sql`](schema.sql) | Annotated database schema (source of truth) |
| [`SECURITY.md`](SECURITY.md) | Reporting vulnerabilities |

> **Take the collection seriously. Don't take yourself seriously.**
