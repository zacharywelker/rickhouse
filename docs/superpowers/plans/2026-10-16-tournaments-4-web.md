# Tournaments, Plan 4: The web UI (as built)

> **Status: built and reviewed, not yet pushed.** Unlike Plans 2 and 3, this plan was written *after* the build. The web UI was built task by task in a worktree (`claude/tournament-web`, 27 commits, 83 files, +6347/-42 against `main` after PR #246), verified in a browser and by an end-to-end test, reviewed once as a whole branch and once on its fixes. A plan embedding about 6,000 lines of code to rebuild what already exists would only repeat the branch, so this note records what was built, why, and what to know before Plan 5 (iOS).
>
> Spec: `docs/superpowers/specs/2026-10-13-tournament-design.md` (sections 4, 5, 7, 8; amended by this work, see the end).

## Shape

The web calls the data layer directly: pages are server components (`requireSession`, `getTournament`, `rankingFor`, ...) and every mutation is a server action in `src/app/(app)/tournaments/actions.ts` that validates with the **same zod schemas as the API** and maps a `Failure` to `{ ok: false, error, fieldErrors }`. The web never calls `/api/v1`. Logic lives in pure modules with vitest tests (the repo has no jsdom or testing-library, and none was added); components are thin; Playwright covers the screens.

| Route | What it is |
| --- | --- |
| `/tournaments` | list, new, delete (draft or finished), link to the ranking |
| `/tournaments/new` | field picker (filters, select all shown, labels you do not own, outside entries), settings, priority list |
| `/tournaments/[id]` | one page for every state: the bracket (columns of rounds, cards of flights, no connector lines), the draft editor (settings, Move/Swap, rename, edit field, Reset, Start), the running page (Play, Undo, Withdraw, Find a bottle, collapse finished rounds, standings, champion), the foot bar |
| `/tournaments/[id]/play/[heatId]` | play a flight: open ranking, or blind `start -> mapping -> rank -> revealed` (solo and pourer share one flow) |
| `/tournaments/ranking` | ranking and audit with a category filter |
| label page | one line "Tournament rank: 3 of 41 in bourbon" when the label or one of its bottles has a firm rank |

## Tasks as built (commit order)

1. Server actions and failure mapping (`91e591e`).
2. Field candidates and filters: `fieldCandidates` over `bottle_list` with a tastings count, `labelCandidates` (`adb5f27`).
3. Nav link and list page (`4d5bf84`). **Side effect:** seven links did not fit the desktop row at 1024px, so the header collapses to the disclosure at `xl` (1280px) instead of `lg`, on every page.
4. Setup page: pure `priority.ts` and `field-selection.ts` reducers (500-entry cap, dedupe), picker, extras, settings (`8f3092b`).
5. Bracket and draft: pure `bracket-model.ts`, `page-scroll.ts`; `PageBar`; flight cards; Move and rename; draft settings (`08bfead`).
5b. Draft completeness, found while building task 5: the round-1 preview is made when a draft with 2+ entries is created or its field changes, not on page load (`0c678db`); **swap** two entries (server `swapEntries`, route, action, UI) because Move is refused into full flights (`b169ea1`); edit a draft's field (`76c80da`).
6. Running and finished tournaments (`c98c0a3`): pure `bracket-actions.ts` (what each control offers), `standings-model.ts`, `bracket-search.ts`.
7. Play a flight: **server change** `drawHeat` accepts an optional `heatId` so a chosen blind flight can be opened for pouring (`7ff6113`); pure `play-flow.ts` reducer; the Draw button (`68d7a97`).
8. Ranking and audit page (`80e12af`); 9. label-page line with a `labelRank` that never fails the page (`3f0a686`).
10. Playwright `e2e/tournaments.spec.ts` (6 tests: an open tournament to a champion, solo blind, pourer blind, draft editing, the nav at 1280 and 1024, with assertions that Enter in the search does not create, that focus follows Hide and Record, and that a focused Move button is not under a sticky header) plus a safety guard for the throwaway database; DESIGN.md nav line (`a21392e`, `27942b1`).
Review fixes (`77624fa`..`577c599`): no "Advances" marks in a decided final; glass-letter save race; Enter in the search no longer creates the tournament; failed actions refresh the page; a bye's lone bottle is movable; focus follows play stages and sticky headers leave focused controls clear; e2e guard runs before the reset and requires a local database; **a hidden flight shows only its proof band, not even the owner's name for it**.

## Decisions to know

- **Blind on the web.** A pending flight of a running blind tournament carries no names, ids, facts or label. `Show the glasses` is an explicit click that calls `drawHeat(heatId)`; the mapping screen is the only place names appear; hiding drops them from component state, and the rank stage holds only letters. Checked in the browser: the page text and HTML contain none of the flight's names at the rank stage and after a reload. The owner's roster stays visible (the owner chose the field) and reveals no membership, since seed is the order the owner entered bottles. Byes are named as soon as a round is made, which in a blind tournament shows which bottle is not in a glass.
- **No drag anywhere.** Ranking, Move, Swap and the priority list use buttons only (spec: drag is optional on top). Photos are not shown on the play screens.
- **Tournament numbers on the label page** read "3 of 41 in bourbon" (category as stored, lowercased, not pluralised), the best firm rank among the label and its bottles within its own comparable group.
- **Search** ("Find a bottle") matches only visible rows and reuses the global `/` shortcut's input id.
- **Disk and safety.** Every database command in the build ran behind a guard that refuses unless the worktree's `.env` names the throwaway database; Playwright's helper defaults to the real database name, so the e2e spec now asserts a local throwaway database *before* it resets anything.

## Known gaps

- Relabeling a bottle that is in a tournament fails with the generic "still references this bottle" message, as it already does for bottles with tasting notes. Product decision pending (cascade, move with the bottle, or a clear message).
- The search sends the whole `rounds` payload to the client; a `Segmented` control lacks arrow-key roving; the draft field editor remounts if entries change from another tab; a disabled button can drop focus.
- Six photo-upload specs of the existing e2e suite fail in this sandbox (`mkdir /data`); not caused by this branch, not re-run on a clean `main`.

## Spec amendments made with this work

The spec now also says: swap (4, Move), a running tournament accepts only priority and seeding changes (4, Priority control), Draw may name a pending flight (5), a draft with 2+ entrants always has its preview (4, Starting), and a blind pending flight shows neither the generated nor the owner's own flight name (4, Flight labels). Plan 3 line 19 was corrected to match.

## For Plan 5 (iOS)

Everything above is served by `/api/v1/tournaments` (including `swap` and `draw` with `heatId`; see `ios/README.md`), so iOS needs no new server work for these screens. Reuse the same flow: open or blind `start -> mapping -> rank -> revealed`, buttons for ranking (28 pt arrows with 44 pt hit areas per the spec), Tournaments under the Account tab.
