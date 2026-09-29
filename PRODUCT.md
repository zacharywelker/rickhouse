# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Collectors who self-host. They run Docker or Unraid, have a shelf of whiskey, rum, agave, gin and more, and want a private record of what they own, what they paid, and what is left in each bottle. The author's own household is one of these installs, not the main audience. A single install serves a household: each person has a private collection, with `admin` and `member` roles.

Typical jobs: log a new purchase at the shelf or right after the store, find a bottle ("everything Bardstown distilled"), check fill levels, group bottles (trips, gifts, favorites), and look at buying and spending patterns.

## Product Purpose

Rickhouse is "a field guide to your liquor collection": a self-hosted bottle tracker. It succeeds when a collector can see what they have, find any bottle fast, and notice patterns in their buying, without handing their collection to a third-party service.

## Positioning

- **Label vs. bottle.** The label (expression: brand, distillery, mashbill, proof, MSRP) is kept separate from the physical bottle (price paid, store, date, batch or barrel, fill level, photos). A second purchase is a second bottle on the same label.
- **Blends are modelled honestly.** Distilleries, mashbills and finishes are linked many-to-many, so a three-distillery blend shows up under all three. When a label names no distillery, that is recorded too: an undisclosed source is a placeholder for the place it admits to, and one identified from outside the label is marked inferred, so a guess never reads as fact.
- **Self-hosted and private.** Your data stays on your hardware. Backups run from inside the app, with a plain-CSV copy you can read without Rickhouse.
- **A collection, not a portfolio.** No market valuation or price scraping.

## Operating Context

- Deployed as two containers (app and PostgreSQL 16) on Unraid or any Docker host, on port 1964. Reached on the LAN or through a reverse proxy. Install guide: `docs/UNRAID.md`.
- Used on desktop for dense grid work (sort, filter, inline edit) and on a phone at the shelf or in a store.
- The first run creates an `admin` account with a generated password printed in the container logs, and asks the user to choose their own.
- Sign-in options: optional SSO, two-step sign-in, passkeys, Cloudflare Turnstile.

## Capabilities and Constraints

- Surfaces: Collection (dense grid and gallery, search, sort, fill level on every bottle), Labels, Groups, Numbers (buying and spending stats, each linked to its bottles), linked entity pages (brands, distilleries, mashbills, finishes, stores), Accounts, Backups.
- Stack is locked by `SPEC.md`: Next.js 15 App Router, Drizzle, Postgres 16, Tailwind v4 with shadcn/ui tooling, TanStack Table, Better Auth, Zod, and `sharp` with images on local disk. Mutations go through server actions.
- `schema.sql` is the source of truth for the data model. Fields specific to one category (for example rum) are sparse nullable columns, shown according to `categories.field_group`.
- Terminology: **label** (in the schema, `expression`) is the product and **bottle** is the physical unit. Use "label" in UI copy.
- Non-goals (`SPEC.md`): no sharing between accounts or social features, no price scraping or third-party APIs, no native mobile apps, no merging labels with bottles, no text columns in place of join tables, no SQLite, no LLM label reader for now.
- Next milestone: M9, tastings beyond the shelf.
- **Visual direction (decided 2026-09-28):** `DESIGN.md`, a Swiss field guide that has been lived in (paper tones, ruled sections, stamps and painter's tape), with tokens in `docs/DESIGN-TOKENS.md`. It supersedes the Liquid Glass direction once recorded in `SPEC.md`.

## Brand Commitments

- Name: **Rickhouse**. Tagline: "A field guide to your liquor collection."
- Motto: **"Take the collection seriously. Don't take yourself seriously."**
- Voice: curiosity over connoisseurship. Never reads like a luxury spirits publication or an experts-only database. Humor comes from the user's actual data ("the data earns the joke").
- Rick, the dog, is a recurring character. He appears only when he has something to say.
- Color follows spirit category (agave, whiskey, gin, rum, vodka, liqueur), not generic status colors. The category palette is defined in `docs/DESIGN-TOKENS.md`.

## Evidence on Hand

- Real product docs: `README.md`, `SPEC.md`, `schema.sql`, `docs/UNRAID.md`, `SECURITY.md`, `docs/DESIGN-BRIEF.MD`, `DESIGN.md`, `docs/DESIGN-TOKENS.md`.
- Seed and fixture data: `scripts/seed.ts`, `e2e/fixtures` (a local test collection of 41 bottles).
- App icon: `public/icon.svg`.
- None exist yet, so none may be invented: testimonials, user counts, reviews, press, benchmarks, or pricing. Rickhouse is a free, self-hosted project.

## Product Principles

1. **The user's bottles are the stars.** Photos, fill levels and the user's own records come before the product's own decoration.
2. **Model the shelf truthfully.** Label vs. bottle, real blends, sparse category fields. Never simplify the data to make the UI easier.
3. **Private and portable.** It runs on the user's hardware, and their data can be read without Rickhouse.
4. **Dense but approachable.** Grids, filters and inline editing that are as capable as a spreadsheet, in an app that is fun to open.
5. **Fun first, then discovery, then data.** Each surface should make that order possible without giving up usefulness.

## Accessibility & Inclusion

WCAG 2.2 AA is the minimum: contrast, visible focus, full keyboard access, correct roles and names, and support for `prefers-reduced-motion`. It is tested, not assumed (Playwright e2e suite under `e2e/`).
