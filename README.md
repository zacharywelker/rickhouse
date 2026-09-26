# Rickhouse

**A field guide to your liquor collection.**

Rickhouse is a self-hosted bottle tracker for people who have stopped pretending they're going to stop buying bottles.

It keeps track of what you own, where it came from, what you paid for it, what's in the bottle, and — eventually — what the hell happened along the way.

Whiskey, rum, agave, gin, vodka, liqueurs, weird stuff from that one distillery you found on vacation. If it belongs on your shelf, Rickhouse wants to know about it.

---

## What makes Rickhouse different

Most collection apps treat bottles like inventory.

Rickhouse treats them like **objects with stories**.

A bottle has a product behind it — the brand, label, recipe, proof, MSRP, distillery and other reference data.

But the bottle itself has a life:

* when you bought it
* where you bought it
* what you paid
* which batch or barrel it came from
* how much is left
* when you opened it
* where it lives
* who you were with
* what you thought of it
* and, ideally, photographic evidence

That distinction matters.

**The label is what the bottle is.
The bottle is what happened to you.**

---

## A Swiss-designed field guide

Rickhouse is built around a simple tension:

> **Precision underneath. Humanity on top.**

The foundation is deliberately Swiss:

* rigorous grids
* strong typography
* dense information
* clear hierarchy
* restrained borders
* obsessive alignment

Then we mess with it.

Bright category colors. Real bottle photography. Painter's tape. Sharpie annotations. Crooked labels. Scribbles in the margins. Occasional illustrations from Rick, our increasingly opinionated house archivist.

The interface should feel **collected rather than generated**.

Not fake vintage.

Not luxury whiskey bar.

Not generic SaaS dashboard.

Not 47 floating cards with a gradient behind them.

Rickhouse takes the collection seriously.

It does not take itself seriously.

---

## The collection

### Collection

A dense, useful workbench for the bottles you actually own.

Search, sort, filter, edit, scan, browse and compare without fighting the interface.

Gallery view turns the collection into something closer to a shelf than a spreadsheet.

Every bottle has a real fill level, so an unopened bottle and the sad last pour are not the same thing.

### Labels

The canonical product reference.

Brands, distilleries, mashbills, finishes, stores and other reference data are linked records rather than text sprinkled throughout the database.

So:

> “Show me everything Bardstown distilled.”

actually means something.

Even when Bardstown contributed one part of a three-distillery blend.

### Groups

Personal collections within the collection.

Trips. Favorites. Gifts. “Stuff I bought in Kentucky.” “Things Zach insists are different.” Whatever deserves its own little corner of the scrapbook.

Groups are curated, not just saved filters.

### Numbers

Analytics without turning your liquor cabinet into a quarterly earnings report.

Rickhouse looks for interesting things:

* what you keep buying
* what you apparently refuse to stop buying
* which distilleries dominate your collection
* how much you've spent
* what categories are growing
* unusual bottles
* patterns in proof, age, geography and price

Every observation should lead back to the bottles that produced it.

**The data earns the joke.**

### Timeline

The collection has a history.

Acquisitions, openings, tastings, trips, gifts, discoveries, photos, milestones and memories can become part of the record.

Rickhouse shouldn't just tell you what you own.

It should eventually be able to tell you **how the collection happened**.

---

## Rick

Rick is the recurring character who lives inside the archive.

Sometimes he's a polished illustration.

Sometimes he's a terrible little Sharpie drawing in the margin.

Sometimes he's just the voice telling you that yes, technically, you do already own fourteen bottles of bourbon.

He's not a mascot.

**Rick lives here. He doesn't work here.**

His personality can range from **Quiet** to **Observant** to **Nosy** to **Unhinged**.

The default is Nosy.

Obviously.

---

## Design principles

Rickhouse follows a few rules pretty religiously:

1. **The grid is the rule. Breaking the grid is the reward.**
2. **Precision underneath. Humanity on top.**
3. **The data earns the joke.**
4. **Utility is never sacrificed for personality.**
5. **Rickhouse should feel collected, not generated.**
6. **Curiosity over connoisseurship.**
7. **Real photography beats decorative illustration.**
8. **Personality should appear where it means something.**

The complete visual and interaction system lives in [`docs/DESIGN.md`](docs/DESIGN.md).

Implementation tokens live in [`docs/DESIGN_tokens.md`](docs/DESIGN_tokens.md).

---

## A few things Rickhouse cares about

**Dense information is a feature.**
You have a lot of bottles. We shouldn't make you scroll through giant cards to find them.

**The physical world matters.**
Bottles have locations, fill levels, photos and histories. Rickhouse models the real collection instead of pretending it's just a database.

**Empty doesn't mean deleted.**
Finishing a bottle is part of its story.

**Search should be powerful without becoming a programming language.**

**Accessibility is part of the design.**
Color isn't the only way something communicates. Keyboard navigation, semantic markup, readable handwriting, focus states and reduced motion all matter.

**Mobile isn't a tiny desktop.**
Desktop is the workbench. Mobile is the field companion.

**Personality has a volume knob.**
You can make Rick quieter without making Rickhouse sterile.

---

## Under the hood

Rickhouse is intentionally boring in the places where boring is good.

* **Next.js / TypeScript**
* **PostgreSQL**
* **Drizzle**
* **Docker**
* **GitHub Actions**
* **GHCR**
* Designed to run happily on **Unraid**

The database separates **labels** from **bottles** and uses real relationships for things like distilleries, mashbills, finishes, brands and stores.

A bottle isn't a blob of JSON pretending to be a database.

Blends are represented as blends. Mashbills are made of grains. Categories form a hierarchy. Physical bottles carry their own acquisition and lifecycle information.

The boring foundation gives us room to make the surface weird.

---

## Running Rickhouse

### Unraid

The intended home for a personal deployment is Unraid.

See **[`docs/UNRAID.md`](docs/UNRAID.md)** for the complete installation guide.

The short version of the short version:

**GitHub builds it → GHCR stores it → Unraid runs it.**

### Development

```sh
npm install
docker compose up -d
npm run dev
```

See the project scripts and Compose files for the development setup.

---

## Project map

| File                                                             | What you'll find                            |
| ---------------------------------------------------------------- | ------------------------------------------- |
| [`SPEC.md`](SPEC.md)                                             | Product specification and build plan        |
| [`docs/DESIGN.md`](docs/DESIGN.md)                               | The Rickhouse visual and interaction system |
| [`docs/DESIGN_tokens.md`](docs/DESIGN_tokens.md)                 | Implementation-level design tokens          |
| [`docs/UNRAID.md`](docs/UNRAID.md)                               | Unraid deployment                           |
| [`schema.sql`](schema.sql)                                       | Annotated database source of truth          |
| [`src/db/schema.ts`](src/db/schema.ts)                           | Drizzle schema                              |
| [`src/lib/admin/registry.ts`](src/lib/admin/registry.ts)         | Lookup entity definitions                   |
| [`scripts/`](scripts/)                                           | Migrations, seeding and backups             |
| [`docker-compose.yml`](docker-compose.yml)                       | Production container stack                  |
| [`.github/workflows/publish.yml`](.github/workflows/publish.yml) | Container publishing                        |

---

## Status

Rickhouse is under active development.

The goal isn't to build another inventory database.

The goal is to build the place where your collection **lives**.

That means the boring parts need to be solid before the weird parts get to have fun.

And yes, we're going to let the weird parts have fun.

---

> **Take the collection seriously.
> Don't take yourself seriously.**
