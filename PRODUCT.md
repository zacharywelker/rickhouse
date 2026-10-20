# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Home collectors of whiskey and other spirits who want a private, accurate record of what they own, what they paid and what is left in each bottle, and a quick way to log what they taste. They use it on a phone at the shelf, in a store or at a bar, and on a computer for dense work. Many run their own server (Docker, Unraid). A hosted option for people who don't is planned.

## Product Purpose

Rickhouse is a bottle manager first, then a tasting log, and over time a trusted source of facts about spirits. It succeeds when a collector can see what they have, find any bottle fast (including from a phone in a store), log what they taste in seconds, and notice patterns in what they buy and drink. A collector decides what leaves their own server, and what does leave is minimal.

The product has bottle management and a tasting log today. A shared catalog and social features remain future possibilities and are not committed.

## Positioning

- Label versus bottle. A label (brand, distillery, mashbill, proof) is kept separate from a bottle (price paid, store, date, batch or barrel, fill level, photos). A second purchase is a second bottle on the same label.
- Tastings belong to labels. You can log a tasting of something you don't own, and tastings build a searchable history. A bottle is optional.
- Blends are modelled honestly. Distilleries, mashbills and finishes link many-to-many, so a three-distillery blend appears under all three.
- Your data stays yours: self-hosted by default, with in-app backups and a plain CSV copy you can read without Rickhouse.
- A collection, not a portfolio. No market valuation or price scraping.

## Operating Context

- Server: two containers (the app and PostgreSQL 16) on Unraid or any Docker host, on port 1964, reached on the LAN or through a reverse proxy. Install guide: `docs/UNRAID.md`.
- Used on a computer for dense work (sort, filter, edit) and on a phone at the shelf, in a store or at a bar, with the camera and a barcode scanner.
- Current release: the web app runs on the user's own server. The native iOS app is a server-connected companion; it requires that server and does not provide standalone storage or sync. Standalone native apps with on-device data and sync are planned. A hosted service is a possible later option, not available today.
- The first server run creates an `admin` account with a generated password and asks for a new one.
- Sign-in options: optional SSO, two-step sign-in, passkeys, Cloudflare Turnstile.
- Reaching a self-hosted server from a phone away from home needs the user to expose it (a reverse proxy or a VPN such as Tailscale). The app cannot assume that works.

## Capabilities and Constraints

- Surfaces: Collection (gallery and dense table, search, sort, fill level on every bottle), Labels, Groups, Numbers, tastings, What to drink tonight on iOS, Spin the Bottle on web, linked entity pages (brands, distilleries, mashbills, finishes, stores), Accounts, Backups. Camera capture and barcode scanning on phones.
- The current iOS client requires a Rickhouse server. Standalone storage, on-device database, cross-device sync, and first-connection reconciliation are future work.
- Server stack (locked by `SPEC.md`): Next.js App Router, Drizzle, Postgres 16, Tailwind v4, TanStack Table, Better Auth, Zod, and `sharp` with images on local disk. No SQLite as the server database; SQLite is planned for standalone mobile storage. The versioned bearer-token JSON API and SwiftUI iOS client are implemented. Android and the on-device database are future work.
- `schema.sql` is the source of truth for the data model. Label (in the schema, `expression`) and bottle are separate. A tasting belongs to a label and optionally to a bottle. Category-specific fields are sparse nullable columns shown according to `categories.field_group`. Amaro is a category.
- Data leaving a server: catalog lookups use a label or barcode only. Contributions share flavor tags from a fixed vocabulary only. Both are opt-in. Free text and longer descriptions never leave the user's data.
- Terminology: **label** (in the schema, `expression`) is the product and **bottle** is the physical unit. Use "label" in UI copy.
- Non-goals: no price scraping or market valuation; no LLM label reader for now; no merging labels with bottles; no text columns in place of join tables. Social features are a far-future possibility, not committed; each person's collection is private.
- Current focus: complete and verify the server-connected iOS companion, then prioritize standalone storage and sync against the implementation plan.

## Brand Commitments

- Name: **Rickhouse**. Motto: **"Take the collection seriously. Don't take yourself seriously."**
- Voice: curiosity over connoisseurship. It never reads like a luxury spirits publication or an experts-only database. Humor comes from the user's own data.
- Rick, the dog, is retired as a character.
- Tagline: **"A field guide to your liquor collection."** Kept for now; revisit if it stops fitting.
- Visual identity lives in the design-language spec (`docs/superpowers/specs/`).

## Evidence on Hand

- Real docs: `README.md`, `SPEC.md`, `schema.sql`, `docs/UNRAID.md`, `SECURITY.md`, and the design-language spec. `DESIGN.md` and `docs/DESIGN-TOKENS.md` are superseded.
- Seed and fixture data: `scripts/seed.ts` and `e2e/fixtures` (a local test collection of 41 bottles).
- App icon: `public/icon.svg`.
- None exist yet, so none may be invented: testimonials, user counts, reviews, press, benchmarks or pricing.

## Product Principles

1. **The user's bottles are the stars.** Photos, fill levels and the user's own records come before the product's own decoration.
2. **Model the shelf truthfully.** Label versus bottle, real blends, sparse category fields. Never simplify the data to make the UI easier.
3. **Private by default, portable always.** Nothing leaves the user's data unless they opt in, and what leaves is minimal. Their data can be read without Rickhouse.
4. **Useful alone, better with a server.** The core works on one phone. A home server adds sync, the desktop app, household accounts and backups.
5. **Fast to capture, dense when needed, fun to open.**

## Accessibility & Inclusion

WCAG 2.2 AA is the minimum: contrast, visible focus, full keyboard access, correct roles and names, and support for `prefers-reduced-motion`. On native apps, support the platform's screen readers and system text size. It is tested, not assumed (Playwright e2e suite under `e2e/`).
