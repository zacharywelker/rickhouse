# Rickhouse for iOS

A native SwiftUI companion to the self-hosted web app: browse the collection, open a bottle, add one with photos from the camera.

Requires iOS 17+ and Xcode 15+. It talks to your own server; there is no cloud service.

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

Enter the `https://` address you open Rickhouse at (through your reverse proxy, or Tailscale) and your username and password. Release builds refuse plain `http://`, so the token never crosses the network unencrypted; Debug builds allow it for a local development server. The server answers with a bearer token, which the app keeps in the Keychain. Two-step sign-in (authenticator app, backup code or emailed code) is supported. An account still holding a generated password must pick its own in the web app first.

## Server API

The app uses a small JSON API under `/api/v1`, plus two web routes that accept the same bearer token.

| Request | Purpose |
| --- | --- |
| `POST /api/auth/sign-in/username` | Sign in; the token comes back in the `set-auth-token` header |
| `GET /api/v1/me` | Who the token belongs to |
| `GET /api/v1/bottles` | The collection; takes the web grid's `q`, `status`, `sort`, `desc`, `page`, `size`, … |
| `GET /api/v1/bottles/:id` | One bottle with label specs, photos and tasting notes |
| `POST /api/v1/bottles` | Add a bottle of an existing label (`expressionId` required) |
| `GET /api/v1/expressions?q=` | Search labels for the picker |
| `POST /api/bottles/:id/images` | Multipart photo upload (`images` field) |
| `GET /api/images/<path>` | A photo or thumbnail |

Every `/api/v1` response carries `x-rickhouse-api` (currently `1`). Within a version the API only adds fields; the app refuses a server outside the versions it supports and says which side to update.

Errors from `/api/v1` look like `{ "error": { "code", "message", "fields?" } }`.

## Not yet

Editing fill level, tasting notes, creating new labels, groups, Numbers, passkeys (they need the paid Apple Developer Program) and SSO.
