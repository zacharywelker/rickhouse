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
| `GET /api/v1/expressions?q=` | Search labels for the picker |
| `POST /api/bottles/:id/images` | Multipart photo upload (`images` field) |
| `GET /api/images/<path>` | A photo or thumbnail |

Every `/api/v1` response carries `x-rickhouse-api` (currently `1`). Within a version the API only adds fields; the app refuses a server outside the versions it supports and says which side to update.

Errors from `/api/v1` look like `{ "error": { "code", "message", "fields?" } }`.

## Look

The app follows the design-language spec (`docs/superpowers/specs/`): paper and ink, a frame coloured by category on every bottle photo, Inter for the interface and Source Serif 4 for headlines. Both fonts are bundled unmodified in `ios/Rickhouse/Fonts/` under the SIL Open Font License; the licence texts sit beside them. The gallery shows three columns by default; Account → Preferences switches to two, which add a second fact under each bottle. Light mode only for now.

## Not yet

Finishing a bottle (marking it killed), editing a bottle's other fields, creating new labels, groups, Numbers, the Labels tab, marks (open date, gifted by, store pick), category facts such as rum age or gin style, dark mode, passkeys (they need the paid Apple Developer Program) and SSO.
