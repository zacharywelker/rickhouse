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
| `PATCH /api/v1/bottles/:id` | Change a bottle: its level (`fillPct`, below full opens a sealed bottle), its Opened date (`dateOpened`; clearing it on an open bottle needs `ifOpenedCleared`: `keep_open` or `seal`, which sets the level to full) and its own facts (`pricePaid`, `storeId`, `dateAcquired`, `batch`, `releaseYear`, `barrelNumber`, `pickName`, `location`, `notes`, `expressionId`; changing the label moves the bottle's tastings and tournament entries to the new label). `null` clears a fact; an unlisted field is a `422`. The answer says what else changed |
| `POST /api/v1/bottles/:id/tasting-notes` | Add a tasting note: `tastedOn`, `rating` (0 to 10), `nose`, `palate`, `finish`, `overall` |
| `PATCH` / `DELETE /api/v1/bottles/:id/tasting-notes/:noteId` | Replace (send every field) or delete a note |
| `POST /api/v1/bottles` | Add a bottle of an existing label (`expressionId` required) |
| `GET /api/v1/expressions?q=&upc=` | Search labels for the picker. `upc` finds a label by barcode (exact; a 12-digit UPC-A and its 13-digit EAN form match each other); a bad code is a 422. Each label carries its `upc` |
| `POST /api/v1/expressions` | Start a label: `brand` (a name, created if new), `name`, `categoryId`, optional `upc`. Answers `201` with the label; a label the brand already has is a `409` `duplicate` that carries it as `existing` |
| `PATCH /api/v1/expressions/:id` | A body of only `{ "upc": "…" }` saves a scanned barcode onto a label that has none and never overwrites (a different code is a `409` `has_barcode`). Anything else edits the label: `name`, `brandId` or `brand`, `categoryId`, `proof`, `ageStatement`, `ageYears`, `sizeMl`, `msrp`, `upc`, and the three link lists together. A brand and name another label already has is a `409` `name_taken` carrying it as `existing` |
| `GET /api/v1/expressions/:id` | One label, read rather than edited: its specs and photo, known releases, your bottles of it and the tastings on them. Each tasting has a `provenance` object (`singleBarrel`, `privateSelection`, `pickName`, `pickedBy`, `barrelNumber`, `release`, `batch`, `releaseYear`), or `null` for a standard bottle or a pour of a bottle you don't own. Also `tournamentRank` (`{ rank, of, text, categoryId }`, e.g. "Tournament rank: 3 of 41 bourbons", or null when no firm rank) |
| `GET /api/v1/tastings` | Your tasting history, newest first (`page`, `size`): each note names its label and bottle |
| `POST /api/v1/tastings` | Log a tasting of one of your labels: `expressionId`, optional `bottleId` (your bottle of that label; makes the source "owned"), `source` (owned, bar, bottle_share, sample, store_pour), `tastedAt`, `tastedOn`, `rating`, `tags` and the four texts. A pour of a bottle you don't own has no `bottleId` |
| `PATCH` / `DELETE /api/v1/tastings/:id` | Replace (send every field) or delete a tasting. Its label and bottle don't change |
| `GET /api/v1/tasting-wheels` | The flavor wheels a tasting's `tags` come from: categories, then subcategories, then descriptors with the `key` to store. A label's category names its wheel (see below) |
| `GET /api/v1/categories` | The categories a label can have (`id`, `name`, `parent`, `wheel`), in the web form's order. `wheel` is the flavor wheel its labels use, or null where the family has none yet (vodka, liqueur, other) |
| `GET /api/v1/tonight?category=1,2&sealed=1` | What each step of What to drink tonight shows for the choices so far: the spirits with open, sealed and muted counts, whether the proof step applies and its bands, whether flavors apply and which, or the "time to open a new bottle" fallback |
| `POST /api/v1/tonight/pick` | Draw one bottle: `mode` (`flow` or `roulette`), `categories`, `sealed`, `bands`, `flavors`, `only` (`sealed` or `open`, for the fallback) and `exclude` (ids already shown). A weighted draw, not a filter; muted bottles are never drawn. Answers `{ pick: { bottle, why, left } \| null }` |
| `GET /api/v1/mutes` | The muted bottles still muted, soonest to return first, with the `window` of end dates a new mute may have and the `presets` (1 week, 1 month, 3 months) as dates in the server's calendar |
| `PUT` / `DELETE /api/v1/bottles/:id/mute` | Mute a bottle until `{ "until": "YYYY-MM-DD" }` (after today, at most three months out; again to change the date), or clear it |
| `GET` / `POST /api/v1/tournaments` | Your tournaments, newest first with their round and progress; or make a draft: `name`, `heatSize` (2 to 6), optional `seeding` (`similar` or `random`), `groupOrder` (proof, mashbill, distillery, age, finish, each once, highest priority first), `blind`, `fieldNote`, and `entries` (`{ "bottleId" }`, `{ "expressionId" }` for a label with no bottle, or `{ "name" }` for an outside entry). Answers 201 with `{ id }` |
| `GET` / `PATCH` / `DELETE /api/v1/tournaments/:id` | One tournament with its entries (each with its leaf `category` name and `finishes`), rounds of flights (each with its entries, their `category` and `finishes`, places, `label`, generated `autoLabel` and proof `band`), `plan`, `standings` and `champion`. A pending flight of a running blind tournament is `hidden`: no names, ids, facts or `label` (even one you gave it), only its band and glass letters. PATCH changes a draft's settings or whole field (a running tournament accepts only `groupOrder` and `seeding`); DELETE needs a draft or finished one |
| `POST /api/v1/tournaments/:id/start` / `reset` | Lock the field and start (making round 1 if there is no preview), or regroup to the automatic choice: all of round 1 in a draft, else the entries of the current round's undecided flights. Send `{}` |
| `POST /api/v1/tournaments/:id/draw` | For a pourer: a random pending flight of the current round with its glasses labelled at random, showing what is in each glass. Send `{}`, or `{ "heatId" }` to open that pending flight of the current round instead (letters it already has are kept) |
| `POST` / `DELETE /api/v1/tournaments/:id/heats/:heatId/result` | Record a flight's result, `{ "ranking": [entryId, ...] }` best first or `{ "glasses": ["B", "A", ...] }` for a flight poured blind; or take it back until a flight of the next round has one |
| `PUT /api/v1/tournaments/:id/heats/:heatId/glass`, `PATCH .../heats/:heatId` | Set which glass letter each entry is poured into, `{ "assign": [{ "entryId", "glass" }] }`; or name a flight, `{ "label": "MGP 95/5" }` (null clears it) |
| `POST /api/v1/tournaments/:id/entries/:entryId/swap` | Trade places with an entry of another undecided flight of the current round, `{ "withEntryId" }`; both flights keep their size (the way to rearrange when every flight is full) |
| `POST /api/v1/tournaments/:id/entries/:entryId/move` / `withdraw`, `PATCH .../entries/:entryId` | Move an entry to another undecided flight, `{ "toHeatId" }`; take it out of a running tournament; or match an outside entry to one of your bottles or labels, `{ "bottleId" }` or `{ "expressionId" }` |
| `DELETE /api/v1/tournaments/:id/entries/:entryId` | Remove a bottle from a draft (no body): its flight shrinks (one left is a bye, none left disappears), other flights keep their names and places; fewer than two entries left clears the preview; a started tournament is a 409 (withdraw instead) |
| `POST /api/v1/tournaments/:id/heats/:heatId/move` | Reorder flights: put an undecided flight at place `{ "toSlot" }` (1 = first, at most the round's flight count, else 422) in a draft or the current round of a running tournament (blind too); the others shift and slots stay 1..n; a decided flight is a 409; Reset to automatic loses a manual order |
| `GET /api/v1/tournaments/ranking?categoryId=` | The long-term ranking across all your tournaments and the `audit` of where it disagrees with your 0 to 10 ratings. Outside entries are never ranked; competitors in different `group`s cannot be compared |
| `GET /api/v1/tournaments/field?q=&categoryIds=&statuses=&opened=&tasted=` | Your bottles to pick a field from, `{ rows: [{ bottleId, expressionId, name, category, categoryId, proof, status, isOpen, tastings, avgRating }], total }` (rows capped at 500, `total` counts every match). `categoryIds` and `statuses` are comma lists (a category includes those under it; no `statuses` means owned and open, `all` every status); `opened` is `any`, `open` or `sealed`; `tasted` is `any`, `tasted` or `untasted`. Junk values are ignored, never an error. `name` is what an entry made from the bottle is called |
| `GET /api/v1/tournaments/field/labels?q=` | Your labels, `{ rows: [{ expressionId, name, category, proof }] }` (30 at most), whose brand or name has every word of `q`; blank `q` lists the first 30. For adding a label with no bottle |
| `POST /api/bottles/:id/images` | Multipart photo upload (`images` field) |
| `GET /api/images/<path>` | A photo or thumbnail |

Every `/api/v1` response carries `x-rickhouse-api` (currently `1`). Within a version the API only adds fields; the app refuses a server outside the versions it supports and says which side to update.

Errors from `/api/v1` look like `{ "error": { "code", "message", "fields?" } }`. A `409` (`duplicate`, `has_barcode`) adds an `existing` label beside `error`.

## Look

The app follows the design-language spec (`docs/superpowers/specs/`): paper and ink, a frame coloured by category on every bottle photo, Inter for the interface and Source Serif 4 for headlines. Both fonts are bundled unmodified in `ios/Rickhouse/Fonts/` under the SIL Open Font License; the licence texts sit beside them. The gallery shows three columns by default; Account → Preferences switches to two, which add a second fact under each bottle. Light mode only for now.

### Icon and launch screen

The app icon is the brand kit's `docs/brand/app-icon-dark-square.svg` (see `docs/brand/README.md`), rendered to a 1024 px PNG at `ios/Rickhouse/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`. iOS applies its own corner mask, so the tile is full-bleed. If the SVG changes, render it again (on a Mac, `qlmanage -t -s 1024 -o <dir> app-icon-dark-square.svg`) and **remove the alpha channel**: the App Store rejects an icon that has one. The colors should come out exactly navy `#14213D`, ivory `#FFF8E7` and orange `#FC9350`.

The launch screen is plain ivory paper (`#FFF8E7`, the `LaunchBackground` color in the same asset catalog), so there is no white or black flash before the first screen. The key that names the color is the one entry in `project.yml`'s `info:` block; the rest of the Info.plist is generated from the `INFOPLIST_KEY_` settings, and XcodeGen writes `ios/Rickhouse/Info.plist` (not committed) on each generate.

## Current scope and gaps

The iOS app is a server-connected companion, not a standalone app. It supports
the collection, bottle detail and editing, adding bottles, labels and label
editing, tasting history and logging, Numbers, What to drink tonight, and
tournaments. Groups are not currently an iOS surface.

Known gaps include finishing a bottle (marking it killed), recording bottle
marks such as gifted by or store pick, category-specific facts such as rum age
or gin style, dark mode, passkeys and SSO. Standalone storage, offline use,
on-device backup, and sync are not implemented. Passkeys require the paid Apple
Developer Program for the iOS app's associated domain.

## Tests

`xcodegen generate`, then run the `Rickhouse` scheme's tests (`RickhouseTests`). They cover the logic of editing facts (`EditDrafts.swift`): what changed, what is sent, what an undo sends back, and the checks made before the server is asked. The tournament code is covered the same way: the pure logic (`Rickhouse/Tournament/*`: bracket model, flight actions, play flow, field selection, priority, ranking, limits) and the models (`TournamentModel`, `PlayModel`, `RankingModel`) are tested in `Tournament*Tests.swift` against `StubURLProtocol`, a `URLProtocol` that `APIClient.session` is pointed at, so no server is needed (it can queue answers, fail them, and delay one to race a slow load against a change). Screens are checked by hand on the Simulator.
