# Rickhouse for iOS

A native SwiftUI companion to the self-hosted web app: browse the collection, open a bottle, add one with photos from the camera.

Requires iOS 26+ and Xcode 26+. It talks to your own server; there is no cloud service.

## Build

```sh
brew install xcodegen
cd ios
xcodegen generate     # writes Rickhouse.xcodeproj from project.yml (not committed)
open Rickhouse.xcodeproj
```

Set your signing team in the target's *Signing & Capabilities*, then run.

> The first commit of this app was written without access to Xcode, so it has not been compiled yet. Expect a few small fixes on first build.

## Signing in

Enter the `https://` address you open Rickhouse at (through your reverse proxy, or Tailscale) and your username and password. Release builds refuse plain `http://`, so the token never crosses the network unencrypted; Debug builds allow it for a local development server. If the server has Turnstile on, the app runs the check in a small sheet first and sends its token with the password. The server answers with a bearer token, which the app keeps in the Keychain. Two-step sign-in (authenticator app, backup code or emailed code) is supported. An account still holding a generated password must pick its own in the web app first.

## Server API

The app uses a small JSON API under `/api/v1`, plus two web routes that accept the same bearer token.

| Request | Purpose |
| --- | --- |
| `POST /api/auth/sign-in/username` | Sign in; the token comes back in the `set-auth-token` header |
| `GET /api/v1/server` | Public. The API version and, when the server has Cloudflare Turnstile on, its site key |
| `GET /api/v1/me` | Who the token belongs to |
| `GET /api/v1/bottles` | The collection; takes the web grid's `q`, `status`, `sort`, `desc`, `page`, `size`, … |
| `GET /api/v1/bottles/:id` | One bottle with label specs, photos and tasting notes |
| `PATCH /api/v1/bottles/:id` | Set the fill level (`{ "fillPct": 0-100 }`). Below full opens a sealed bottle, as on the web; the answer says what else changed |
| `POST /api/v1/bottles/:id/tasting-notes` | Add a tasting note: `tastedOn`, `rating` (0 to 10), `nose`, `palate`, `finish`, `overall` |
| `PATCH` / `DELETE /api/v1/bottles/:id/tasting-notes/:noteId` | Replace (send every field) or delete a note |
| `POST /api/v1/bottles` | Add a bottle of an existing label (`expressionId` required) |
| `GET /api/v1/expressions?q=&upc=` | Search labels for the picker. `upc` finds a label by barcode (exact; a 12-digit UPC-A and its 13-digit EAN form match each other); a bad code is a 422. Each label carries its `upc` |
| `POST /api/v1/expressions` | Start a label: `brand` (a name, created if new), `name`, `categoryId`, optional `upc`. Answers `201` with the label; a label the brand already has is a `409` `duplicate` that carries it as `existing` |
| `PATCH /api/v1/expressions/:id` | Save a scanned barcode (`{ "upc": "…" }`) onto a label that has none, so the next scan finds it. Never overwrites: a label with a different code is a `409` `has_barcode`; the same code again is a no-op |
| `GET /api/v1/expressions/:id` | One label, read rather than edited: its specs and photo, known releases, your bottles of it and the tastings on them |
| `GET /api/v1/tastings` | Your tasting history, newest first (`page`, `size`): each note names its label and bottle |
| `POST /api/v1/tastings` | Log a tasting of one of your labels: `expressionId`, optional `bottleId` (your bottle of that label; makes the source "owned"), `source` (owned, bar, bottle_share, sample, store_pour), `tastedAt`, `tastedOn`, `rating`, `tags` and the four texts. A pour of a bottle you don't own has no `bottleId` |
| `PATCH` / `DELETE /api/v1/tastings/:id` | Replace (send every field) or delete a tasting. Its label and bottle don't change |
| `GET /api/v1/tasting-wheels` | The flavor wheels a tasting's `tags` come from: categories, then subcategories, then descriptors with the `key` to store. A label's category names its wheel (see below) |
| `GET /api/v1/categories` | The categories a label can have (`id`, `name`, `parent`, `wheel`), in the web form's order. `wheel` is the flavor wheel its labels use, or null where the family has none yet (vodka, liqueur, other) |
| `GET /api/v1/tonight?category=1,2&sealed=1` | What each step of What to drink tonight shows for the choices so far: the spirits with open, sealed and muted counts, whether the proof step applies and its bands, whether flavors apply and which, or the "time to open a new bottle" fallback |
| `POST /api/v1/tonight/pick` | Draw one bottle: `mode` (`flow` or `roulette`), `categories`, `sealed`, `bands`, `flavors`, `only` (`sealed` or `open`, for the fallback) and `exclude` (ids already shown). A weighted draw, not a filter; muted bottles are never drawn. Answers `{ pick: { bottle, why, left } \| null }` |
| `GET /api/v1/mutes` | The muted bottles still muted, soonest to return first, with the `window` of end dates a new mute may have and the `presets` (1 week, 1 month, 3 months) as dates in the server's calendar |
| `PUT` / `DELETE /api/v1/bottles/:id/mute` | Mute a bottle until `{ "until": "YYYY-MM-DD" }` (after today, at most three months out; again to change the date), or clear it |
| `POST /api/bottles/:id/images` | Multipart photo upload (`images` field) |
| `GET /api/images/<path>` | A photo or thumbnail |

Every `/api/v1` response carries `x-rickhouse-api` (currently `1`). Within a version the API only adds fields; the app refuses a server outside the versions it supports and says which side to update.

Errors from `/api/v1` look like `{ "error": { "code", "message", "fields?" } }`. A `409` (`duplicate`, `has_barcode`) adds an `existing` label beside `error`.

## Look

The app follows the design-language spec (`docs/superpowers/specs/`): paper and ink, a frame coloured by category on every bottle photo, Inter for the interface and Source Serif 4 for headlines. Both fonts are bundled unmodified in `ios/Rickhouse/Fonts/` under the SIL Open Font License; the licence texts sit beside them. The gallery shows three columns by default; Account → Preferences switches to two, which add a second fact under each bottle. Light mode only for now.

### Icon and launch screen

The app icon is the brand kit's `docs/brand/app-icon-dark-square.svg` (see `docs/brand/README.md`), rendered to a 1024 px PNG at `ios/Rickhouse/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`. iOS applies its own corner mask, so the tile is full-bleed. If the SVG changes, render it again (on a Mac, `qlmanage -t -s 1024 -o <dir> app-icon-dark-square.svg`) and **remove the alpha channel**: the App Store rejects an icon that has one. The colors should come out exactly navy `#14213D`, ivory `#FFF8E7` and orange `#FC9350`.

The launch screen is plain ivory paper (`#FFF8E7`, the `LaunchBackground` color in the same asset catalog), so there is no white or black flash before the first screen. The key that names the color is the one entry in `project.yml`'s `info:` block; the rest of the Info.plist is generated from the `INFOPLIST_KEY_` settings, and XcodeGen writes `ios/Rickhouse/Info.plist` (not committed) on each generate.

## Not yet

Finishing a bottle (marking it killed), editing a bottle's other fields, creating new labels, groups, Numbers, the Labels tab, marks (open date, gifted by, store pick), category facts such as rum age or gin style, dark mode, passkeys (they need the paid Apple Developer Program) and SSO.
