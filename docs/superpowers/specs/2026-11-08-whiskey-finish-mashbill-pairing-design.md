# Whiskey: which finish went on which mashbill

Status: draft for approval. Server and web first; iOS as a follow-up PR.

## Intent

A label can have several mashbills and several finishes, and today the two lists are unrelated. For a blend like the 2026 Blue Note Special Reserve that loses the point of the bottle: six finishes sit on one mashbill, and one finish (Cognac) sits on two. The owner should be able to say, inside the **Finishes** field, which mashbills each finish went on and how much of the blend each combination is.

## Stress test: 2026 Blue Note Special Reserve

Source: bluenotebourbon.com/products/2026-blue-note-special-reserve (blend of nine components, 5 to 19 years, 119.9 proof). Percentages add to 100.

| Finish | Mashbill | Share |
|---|---|---|
| Cognac | 84/8/8 | 3 |
| Cognac | 70/21/9 | 12 |
| Madeira | 70/21/9 | 2 |
| Sherry | 70/22/8 | 3 |
| Port | 84/8/8 | 3 |
| Vino de Naranja | 70/21/9 | 41 |
| Vanilla Cognac | 70/21/9 | 15 |
| Apricot Brandy | 70/21/9 | 11 |
| Winter Bock | 70/21/9 | 10 |

Expected roll-ups, computed and never typed: mashbills 84/8/8 = 6, 70/22/8 = 3, 70/21/9 = 91; finishes Cognac = 15, Madeira 2, Sherry 3, Port 3, Vino de Naranja 41, Vanilla Cognac 15, Apricot Brandy 11, Winter Bock 10. The page names no grains, distilleries or finishing durations; the 5 to 19 years are **total** age and are not finishing time. This label must save and reload exactly as above with finishing months blank.

## Rules (from the owner)

1. **Shares only when there is something to share.** A share box appears on a field only when that field has two or more entries (distilleries, mashbills, finishes). One distillery, one mashbill or one finish: no share box.
2. **Finishing duration is months in the finishing cask, nothing else.** Total age is never entered as a finish duration. Months stay optional and per finish.
3. **A finish has a share of the label.** When a finish went on two or more mashbills, its share is broken down per mashbill, and the finish share is the sum of those.
4. **Pairs are the truth.** Once a pair has a share, the mashbill and finish totals are computed from pairs and shown read-only. They cannot contradict each other.
5. **Unfinished remainder.** Part of a mashbill may not have been finished. That is a pair with "No finish", so the same sums hold and the label still totals 100%.

## What the owner sees (all inside the Finishes field)

- Each finish row, when the label has two or more mashbills, gets a **Mashbill** dropdown listing the label's mashbills, defaulting to the first. (The word is "Mashbill", not "Applied to"; chips were tried and read as confusing once a finish touches more than one.)
- When the label has two or more finishes (or an unfinished remainder), each finish row gets a **Share %**.
- When a finish went on two or more mashbills, the row grows one line per mashbill, each with its own Mashbill dropdown and share, plus a "+ Add mashbill" link. The finish's own share becomes a read-only total of those lines. A finish on one mashbill stays a single dropdown and a single share box.
- An **Unfinished portion** row can be added; it also takes "Applied to" and share, because 70/21/9 may be 100% of the label but only part finished.
- The Mashbills field shows each mashbill's share read-only, computed from its pairs, with a note "from finishes". Mashbill shares are typed only when the label has no finishes at all.
- A running total shows next to the field; saving with a total other than 100% (when any share is entered) is refused with the difference named. Leaving every share blank is allowed: shares are optional, never required.

One mashbill, one finish: no extra controls appear and nothing about today's form changes.

## Storage

New table `expression_finish_mashbills`: `(expression_id, mashbill_id, finish_id NULL, share_pct NULL, position)`. `finish_id` NULL means the unfinished portion. Foreign keys to the label's mashbill link and finish link cascade, so removing either from the label removes its pairs and nothing can dangle. A pair with no share is allowed (association only).

`expression_mashbills.share_pct` and a new `expression_finishes.share_pct` stay as stored copies of the computed roll-ups, so existing readers (search, tournaments, grids, iOS today) keep working unchanged. They are written by the save path only, never by the form.

Alternative considered: a JSON column on the finish link. Rejected: no referential integrity, so removing a mashbill leaves stale ids.

Migration is hand-written (drizzle-kit generate does not work here): new SQL file 0053, journal entry, and `npm run db:migrate`. Existing labels get no pairs; they behave as today until edited.

## Save path

`replaceLinks` in `src/lib/expressions/save.ts` deletes and reinserts all link rows. Pairs must be inserted after the mashbill and finish links in the same transaction, and the roll-ups recomputed from pairs. When the finish picker is hidden for a category, saved pairs are preserved the way hidden finish links are today.

Validation (server, not only the form): every pair's mashbill and finish belong to the label; no duplicate (mashbill, finish) pair; shares in 0..100, summing to 100 when any are given; unfinished portion at most once per mashbill.

## Non-goals

- Per-component age or origin state (Blue Note's "19 years, TN"). Total age stays on the label's age fields.
- Grain names for mashbills the label does not disclose.
- Finishing order across pairs; the existing finish sequence applies.
- Spirits other than whiskey. Rum, brandy and liqueur casks keep today's behaviour.
- iOS in the first PR. The phone keeps showing the roll-ups it already reads; the lookups API gains the pair data for the follow-up.

## Tests

- Pure unit tests for roll-up and validation, using the Blue Note table above as the fixture (every total, plus 99%/101% rejection, duplicate pair, unfinished portion).
- DB-backed integration test: save, reload, remove a mashbill and see its pairs gone. These suites are opt-in and not run in CI, so the PR must show counts from a scratch database.
- Playwright: build the Blue Note label in the form from empty, save, reopen.

## Open details for the plan

- Where the "Unfinished portion" row is created (an "Add unfinished portion" button is the current idea).
- Label wording for non-bourbon kinds that already say "Cask Types" (Scotch, Irish, Canadian): pairing applies to them too, with no order or months, as today.
