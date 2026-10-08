# What to drink tonight and Roulette: design

Status: decided in conversation on 2026-10-07, against a clickable mockup. Nothing is built yet.
Builds on sections 8 and 11.5 of `2026-10-05-design-language-design.md` and on the tasting log (`2026-10-06-tasting-log-design.md`). Where this file and those disagree, this file is newer.

## 1. What is decided

| Question | Decision |
| --- | --- |
| Where does it exist? | **The phone only.** The web app keeps its own Spin the Bottle dialog. The + sheet's third row opens it. |
| The flow | A sheet, **one step per screen** with Back, Close and a step count: **Spirit**, then **Proof**, then **Flavors**, then the **result**. Each step is multi-choice boxes; choosing none means "any". |
| The pool | **Open bottles by default.** An "Include sealed bottles" switch sits in every step's footer, off by default. A sealed pick says so and notes that pouring it opens it. Empty bottles (fill 0) and bottles that are not on the shelf are never picked, as in the web roulette. |
| Proof | Three **bands**: Under 90, 90 to 109, 110 and up, each with the number of bottles in play. The step is skipped when the bottles in play span less than 15 proof, or number fewer than three. |
| Flavors | The step shows the flavors you have tasted most for the chosen spirits, with counts. It exists only when the account has at least **25 tastings** overall and, per spirit, at least **10** (the per-spirit minimum is set here; it was open in the design language spec). A spirit with too few tastings, or none of its family's wheel, gets no flavors. |
| Too few tastings | The screen says so plainly ("9 rye tastings so far. Time to open a new bottle?") and offers **Pick a sealed ...** and **Pick from what is open**. |
| The draw | A **weighted draw, not a filter**. See section 3. Flavors and freshness only nudge; nothing is ruled out by them. |
| Result | **One bottle**: its photo in the category frame, the category, its name, a serif line written from your data, proof, fill, bought, and why it came up. Actions: **Log a tasting for this bottle**, **Not this one** (draw another, no repeats), **Mute for a while**, **Open bottle**, **Done**. |
| Mute | Takes a bottle out of every pick, Roulette included, for **1 week, 1 month or 3 months** (none preselected). No longer, so a muted bottle always comes back. **Synced** with the account. **Settings, Muted bottles** lists them with their end dates and lets you change a date (within the same 3 months) or clear it. Undo is offered after every change. |
| Roulette | The fully random option at the foot of every step. It ignores spirit, proof and flavors, and obeys the sealed switch and mutes. Its art is the **brand's playing card**; its loading screen is the card spinning on its vertical axis (about 0.9 s a turn), then turning over to show the bottle. With Reduce Motion on, it goes straight to the result. |

## 2. Spirits, bottles and tastings

- A **spirit** is a label's category (Bourbon, Rye, Scotch, Rum...), with its colour from `categoryColor`. The boxes are the categories the account has bottles in, with "5 open · +2 sealed · 1 muted".
- A tasting belongs to a label, so a bottle's **notes** are the tags of every tasting of its label, including pours of other bottles of it.
- A bottle **has notes** when its spirit qualifies for flavors and its label has at least one tasting with tags. Anything else has none and counts as a wildcard in the draw.
- Flavor keys are the wheel's own descriptor keys (`bourbon/fruity/citrus/lemon`). A chosen flavor matches a bottle whose notes hold exactly that key.

## 3. The draw

Each bottle in play has a weight, and one is drawn at random in proportion to it.

| Part | Weight |
| --- | --- |
| Every bottle | 1 |
| Each chosen flavor it matches in its notes | +1 |
| A bottle with no notes, when flavors are chosen | +1, as if it matched one flavor |
| Never tasted, or last tasted 60 or more days ago | +1 |

- Bottles weigh between 1 and 4 against each other, so the pull is gentle by design: the point is to learn the whole collection, and the draw favors bottles you have not tasted or not tasted lately.
- The freshness nudge applies even when flavors are skipped. Roulette uses none of it.
- Proof bands and spirits are choices the user made, so they still filter. Muted bottles, empty bottles and (unless included) sealed ones are filtered before the draw.
- **Not this one** sends the ids already shown; the draw continues without repeats until the bottles in play are used up, then says so.
- 60 days and +1 per match are constants in one file, to be tuned on real collections.
- The result says why: "Matches oak and caramel from your notes.", "A wildcard: not enough rye tastings to match on flavor.", "Last tasted 69 days ago."

## 4. Server

One migration by hand with its journal entry: `bottles.muted_until date` (null = not muted; a bottle is muted while the date is after today, so expiry needs no job).

New under `/api/v1` (additive; API version unchanged):

| Request | Purpose |
| --- | --- |
| `GET /tonight?category=1,2&sealed=1` | What each step shows for the selection so far: the spirits with counts, whether proof applies and its bands with counts, whether flavors apply and the flavor list with counts, or the too-few-tastings fallback. |
| `POST /tonight/pick` | `{ mode: "flow" \| "roulette", categories, sealed, only?, bands, flavors, exclude }`. Returns the bottle (or null), why it came up, and how many others were left. |
| `GET /mutes` | The muted bottles with their end dates, soonest first, and what a new mute may be: the `window` of end dates (tomorrow to three months from today) and the three `presets` as dates, all in the server's calendar (the database runs on UTC, so a phone in another time zone must not do its own date arithmetic). |
| `PUT /bottles/{id}/mute` | `{ until: "YYYY-MM-DD" }`, after today and no later than three months from today. |
| `DELETE /bottles/{id}/mute` | Clears it. |

`GET /bottles/{id}` also reports `mutedUntil`. The weights, bands, gating and reasons are pure functions in `src/lib/tonight/`, tested on their own; the queries only gather rows. The web roulette is unchanged and, for now, ignores mutes (see section 6).

## 5. Phone

- `AddChoice.tonight` opens the flow instead of `ComingSoonSheet`. Models and calls follow the existing `APIClient` patterns.
- Roulette's button and loading screen use the card art from `docs/brand`, added to the asset catalog as images, plus a card back drawn from the same parts for the spin.
- **Account, Muted bottles** is the settings list. The bottle page shows "Muted until ..." when it applies.
- The + sheet row for this flow needs art of its own, because the card is now Roulette's. Until the brand kit has one it keeps the `moon.stars` symbol.

## 6. Open

1. **The web roulette ignores mutes**, so a bottle muted on the phone can still come up on the laptop. Honoring them there is one extra filter in `spinBottle`; left for the owner's call.
2. The mute lengths, the 60-day staleness and the 10-tasting minimum are guesses to tune on real data.
3. The + sheet row art (item above) and a designer's redraw of the card back.
4. Dark mode, as everywhere (not yet designed).
