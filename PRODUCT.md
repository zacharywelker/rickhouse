# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Home collectors of whiskey and other spirits who want a private, accurate record of what they own, what they paid and what is left in each bottle, and a quick way to log what they taste. They use it on a phone at the shelf, in a store or at a bar, and on a computer for dense work. Many run their own server (Docker, Unraid). A hosted option for people who don't is planned.

## Product Purpose

Rickhouse is a bottle manager first, then a tasting log, and over time a trusted source of facts about spirits. It succeeds when a collector can see what they have, find any bottle fast (including from a phone in a store), log what they taste in seconds, and notice patterns in what they buy and drink. A collector decides what leaves their own server, and what does leave is minimal.

The product grows in stages: bottle management, then the tasting log, then a central catalog the owner hosts, then social features far in the future that are not committed.

## Positioning

- Label versus bottle. A label (brand, distillery, mashbill, proof) is kept separate from a bottle (price paid, store, date, batch or barrel, fill level, photos). A second purchase is a second bottle on the same label.
- Tastings belong to labels. You can log a tasting of something you don't own, and tastings build a searchable history. A bottle is optional.
- Blends are modelled honestly. Distilleries, mashbills and finishes link many-to-many, so a three-distillery blend appears under all three.
- Your data stays yours: self-hosted by default, with in-app backups and a plain CSV copy you can read without Rickhouse.
- A collection, not a portfolio. No market valuation or price scraping.

## Operating Context

- Server: two containers (the app and PostgreSQL 16) on Unraid or any Docker host, on port 1964, reached on the LAN or through a reverse proxy. Install guide: `docs/UNRAID.md`.
- Used on a computer for dense work (sort, filter, edit) and on a phone at the shelf, in a store or at a bar, with the camera and a barcode scanner.
- Three ways to run. Standalone: native iOS and Android apps with all data on the device. With the user's own home server (strongly recommended): the server holds the truth, and devices keep a working copy and sync. Hosted (later, optional): the owner's service.
- The first server run creates an `admin` account with a generated password and asks for a new one.
- Sign-in options: optional SSO, two-step sign-in, passkeys, Cloudflare Turnstile.
- Reaching a self-hosted server from a phone away from home needs the user to expose it (a reverse proxy or a VPN such as Tailscale). The app cannot assume that works.

## Capabilities and Constraints

- Surfaces: Collection (gallery and dense table, search, sort, fill level on every bottle), Labels, Groups, Numbers, tastings, What to drink tonight (phone only; the web keeps its own Spin the Bottle), linked entity pages (brands, distilleries, mashbills, finishes, stores), Accounts, Backups. Camera capture and barcode scanning on phones.
- Source of truth: with a server, the server holds the truth. Standalone, the device holds it.
- Standalone is full core: bottles, photos, labels and tastings all work on the device. Without a server there is no web or desktop app, no sync across devices, no household accounts, no Config and no server backups.
- Standalone backup is manual export only. The export is a human-readable CSV of bottles that Rickhouse can import. It excludes tastings and has no standalone label records. The app says so at export time.
- Connecting a standalone phone to a server: records that match strictly (the same barcode, or the same brand, name, proof and age statement with the same purchase date and price paid) are linked silently, then everything else goes through a duplicate review. After linking, the most recent edit wins per record. Device clocks are trusted. Tastings are copied to the server.
- Server stack (locked by `SPEC.md`): Next.js 15 App Router, Drizzle, Postgres 16, Tailwind v4 with shadcn/ui tooling, TanStack Table, Better Auth, Zod, and `sharp` with images on local disk. No SQLite as the server database; SQLite is expected on the standalone mobile app. A bearer-token JSON API for native clients is under way and unmerged. The iOS client is SwiftUI. Android and the on-device database are undecided.
- `schema.sql` is the source of truth for the data model. Label (in the schema, `expression`) and bottle are separate. A tasting belongs to a label and optionally to a bottle. Category-specific fields are sparse nullable columns shown according to `categories.field_group`. Amaro is a category.
- Data leaving a server: catalog lookups use a label or barcode only. Contributions share flavor tags from a fixed vocabulary only. Both are opt-in. Free text and longer descriptions never leave the user's data.
- Terminology: **label** (in the schema, `expression`) is the product and **bottle** is the physical unit. Use "label" in UI copy.
- Non-goals: no price scraping or market valuation; no LLM label reader for now; no merging labels with bottles; no text columns in place of join tables. Social features are a far-future possibility, not committed; each person's collection is private.
- Next milestone: the tasting log.

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
