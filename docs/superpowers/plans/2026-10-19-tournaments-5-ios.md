# Tournaments, Plan 5: The phone (as built)

> **Status: built and reviewed, not yet pushed.** Like Plan 4, this plan was written after the build. The phone screens were built task by task in a worktree (`claude/tournament-ios`, 21 commits, 78 files, +7637/-26, stacked on the web branch `claude/tournament-web` = PR #249 because the phone needs its server additions: swap, `draw` with `heatId`, a hidden flight's `label` null, and priority changes on a running tournament). The build ran with no database and no server (the Postgres container was gone), so every screen was verified against a canned stub server in the Simulator, not a real one. Spec: `docs/superpowers/specs/2026-10-13-tournament-design.md` (sections 4, 5, 7, 8).

## Shape

SwiftUI under Account > Tournaments (spec: not in the tab bar or the + sheet). One `APIClient` extension (`TournamentAPI.swift`) calls `/api/v1/tournaments`; pure logic is mirrored from the web TypeScript modules with the same test cases ("change both together" header on each file): bracket model, flight actions, standings, search, priority, field selection, play flow, ranking model. Screens are thin. A `StubURLProtocol` in the tests answers canned JSON; `APIClient.session` is the one seam added to existing code.

| Screen | What it is |
| --- | --- |
| Account row, `TournamentsView` | list with progress bars, New, delete (draft or finished), Ranking and audit link |
| `NewTournamentView`, `FieldPickerSheet` | settings, ▲▼ priority list, the field: filters (status, opened, tasted, category, text), select all shown, labels you do not own, outside entries |
| `TournamentScreen` | one screen for every state: round selector, three zoom layouts (Detail, Compact, Map; − / + buttons, pinch optional), flight cards, Move/Swap/rename, settings, edit field, Start and Reset bar; running: Play, Undo, Withdraw, Draw, Find a bottle, standings, champion; a Grouping sheet changes seeding and priority while running |
| `PlayFlightView` | open ranking, solo blind and pourer blind (`start -> mapping -> rank -> revealed`), ▲▼ ranking buttons (28 pt glyph, 44 pt hit area), reveal with Undo and Next flight |
| `RankingView` | ranking and audit, category filter; label page "Tournament rank" line |

## Server additions made for the phone (additive)
`GET /tournaments/field` and `GET /tournaments/field/labels` (the picker's search; junk query values are ignored, never a 500), `tournamentRank` on `GET /expressions/:id` (the server writes the text and pluralizes the category), and an early exit in `labelRank` when the owner has no decided flight (the label page no longer fits the whole ranking on every view).

## Decisions to know
- **Blind:** hidden flights show only band, count and glass letters at every zoom level; the rank stage holds only letters; the drawn mapping is handed to the play screen once and dropped on Hide. The owner's roster of the field they chose stays visible (as on the web).
- **Zoom:** three separate layouts, not scaled text; the level is remembered per tournament on the device. Map shows no bottle text (flight titles can be a distillery or mashbill name).
- **Account subtitle "2 active"** from the mockup is skipped (it would add a request each time the tab opens).
- **Category filter** is single-choice (the existing option sheet is); the server includes child categories.
- Rename works on any non-hidden flight in any state (spec: any heat); the web got the same rule in this branch.

## Known gaps
- No real-server run; every flow was driven in the Simulator through a tap harness against canned and stateful stub answers.
- Not checked on screen: pinch and the zoom buttons' effect at every size, VoiceOver and focus, Reduce Motion, the Grouping sheet and some play stages at accessibility sizes.
- An unknown future status decodes to an `unknown` case; three places treat it as finished or offer Undo (`headerMeta`, `canUndo`, `canDelete`); deferred.
- A struct-held retry closure in `NewTournamentView` and `TournamentsView` keeps a reference loop until the failure is dismissed (summaries only, never blind names).
- The audit rows show a stray separator stub; the complete tournament's ranking link opens all categories.
- Merging with PR #248 (provenance): only the `GET /api/v1/expressions/:id` row of `ios/README.md` conflicts textually; keep both sentences.
