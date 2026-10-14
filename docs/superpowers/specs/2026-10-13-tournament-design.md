# Tournaments: design

Status: decided in conversation on 2026-10-13. Not built.
Builds on `2026-10-06-tasting-log-design.md` (tastings, ratings, `bottle_id` kept `ON DELETE SET NULL`).

## 1. What this is

A tournament is a saved, resumable set of blind or open tastings that ranks bottles by preference. You pick a field, taste small groups ("heats") against each other over as many nights as you like, and the results build a long-term ranking that **audits your 0–10 ratings**: where the ranking and your ratings disagree. Nothing here changes a rating.

## 2. Decisions

| Question | Decision |
| --- | --- |
| Main job | A tournament you start and come back to over many nights. The ranking and the audit are built from its results. |
| Live Beli-style insertion ranking | Not built. The stored heats would support it later. |
| Field size | Any. 2 to hundreds. |
| Who can enter | **Bottles you own** (any status), **labels only** (e.g. a friend's bottle, matched to a label), and **ad hoc** free-text entrants. Chosen with filters: owned, opened, tasted, category, manual pick. |
| Entrant identity | A bottle entrant is the bottle (private picks stay distinct). A label-only entrant is the label. An ad hoc entrant has no identity beyond its tournament. |
| Judge | The account owner only. Each result records who picked, so a group can be added later. |
| Field changes after start | None. The field is locked at start. An entrant can be **withdrawn**. |
| Heat size | One size per tournament: 2, 3 or 4. |
| Grouping | **Automatic, every round**: heats are flights of similar bottles. You set the **priority order** of five keys (proof, mashbill, distillery, age, finish); the default is that order, with proof first. Seeding is `similar` (default) or `random`. |
| Editing | Entrants can be moved between undecided heats of the current round, and the round can be **reset to the automatic grouping** at any time. Decided heats are frozen. |
| How a heat is decided | A forced ranking, 1st to last. No ties. A 2-way heat is a head-to-head. |
| Blind modes | **Solo**: map the heat's bottles to glass letters (A to D) with your own device, hide, rank the letters, reveal. **Pourer**: a second person pours, can draw a random pending heat (double-blind), and hands the phone over. Both can be switched off for an open tournament. |
| Platforms | Everything on web and iOS. Web suits setup (filtering a large field), phone suits live tasting, and either can run a live tasting. |
| Where logic lives | The server. Both clients are thin. |

## 3. Data model

One migration, written by hand, with its journal entry. All tables are owner-scoped like the rest of the schema, with the existing `(ref, owner_id)` composite-key pattern so a row cannot point at another account's bottle or label.

`tournaments`: `id`, `owner_id`, `name`, `status` (`draft`, `active`, `complete`), `heat_size` (2 to 4), `seeding` (`similar`, `random`), `group_order` (text array holding each of `proof`, `mashbill`, `distillery`, `age`, `finish` exactly once; default in that order), `blind` (bool), `field_note` (text; how the field was chosen, for display only), `created_at`, `started_at`, `completed_at`.

`tournament_entries`: `id`, `tournament_id`, `bottle_id` (nullable, `ON DELETE SET NULL`), `expression_id` (nullable), `display_name` (not null, snapshot at entry time so history survives deletion), `status` (`active`, `withdrawn`), `seed`. A bottle entrant also stores its bottle's `expression_id`. Kind is derived: bottle id present means bottle, else expression id present means label-only, else ad hoc.

`tournament_heats`: `id`, `tournament_id`, `round`, `slot`, `label` (nullable; set only when you rename a heat), `status` (`pending`, `decided`, `bye`), `decided_at`, `decided_by` (user id).

`tournament_heat_entries`: `heat_id`, `entry_id`, `place` (null until decided), `glass` (null or one letter, set when the heat is mapped or drawn).

## 4. Rounds and advancement

Rounds are generated one at a time, not as a fixed tree. The first round is generated at start; round *r+1* is generated when every heat of round *r* is decided. This copes with any field size and any heat size, including short heats.

- **Starting.** A tournament needs at least two active entrants.
- **Grouping.** Active entrants fill heats of `heat_size`, in the order given under *Automatic grouping* below. The last heat of a round may be short. A heat of one entrant is a **bye**: it advances with no ranking credit.
- **Seeding.** `similar` (the default) applies the automatic grouping below to every round. `random` shuffles every round.
- **Advancing.** A heat of *s* entrants advances `max(1, floor(s/2))`: a 4-way advances 2, a 3-way or 2-way advances 1.
- **Final.** When the pool entering a round fits in one heat, that is the final. Place 1 is the champion.
- **Standings.** Ordered by the round an entrant left, then place within its heat. Entrants who left the same round with the same place share a standing.
- **Withdrawing.** A withdrawn entrant is removed from any undecided heat, which shrinks (to a bye if one entrant is left). Decided heats are unaffected. Withdrawals and byes never count in the ranking.
- **Skip.** A heat stays pending until decided. Any pending heat of the current round can be played in any order.
- **Undo.** A decided heat can be undone until a heat in the next round has a result. Undoing deletes the generated next round.

### Bracket view, labels and zoom

**Bracket view.** The tournament is shown as columns of rounds, each holding heat cards, on web and phone alike. Every bottle row shows name, proof, mashbill and age in fixed columns. Decided heats show places and mark who advanced; blind pending heats show only the proof band. **No lines join heats across rounds**, because each round regroups by proof and a line would show a feeder relationship that does not exist. Before the tournament starts, the same view previews round 1 (editable) with later rounds as counts. On a phone you page between rounds. **Every flight is shown**, however large the field; a 100-bottle tournament is a long page and that is accepted. Round headers stick while you scroll, a search jumps to a bottle, and collapsing finished rounds is optional. Columns scroll with the page, never in their own scroll areas.

**Flight labels.** Each heat has a label so the bracket is readable. The app generates one from what the heat's bottles share: a shared mashbill, by its name ("Buffalo Trace High Rye") or its recipe ("95/5"), with a shared distillery as a prefix ("MGP 95/5"), falling back to the proof band when nothing is shared. You can rename any heat; a custom label is marked "Yours". Stored as nullable `tournament_heats.label`, with the generated label computed on read. In a **blind** tournament a pending heat shows only its proof band, because a generated label would identify the glass; labels appear once the heat is decided. *Reset to automatic* regroups heats, so it also clears custom labels on the heats it regroups, without a warning (decided).

**Phone zoom.** The tournament screen has three zoom levels, changed by pinch or by − and + buttons: **Detail** (name, proof, mashbill, age), **Compact** (one line per bottle: place, name, proof) and **Map** (one row per round, flight tiles with label, bottle frames and status for the current round, counts for later rounds, and no bottle text). The levels are separate layouts, not scaled text, so nothing drops below 12 pt and the system text size still sets the baseline (`DESIGN.md` section 10). The zoom level is remembered per tournament on the device, not on the server.

### Automatic grouping

The aim is heats a whiskey drinker would pour together: a 125-proof barrel-proof pour should not face a 90-proof one, and three picks of one label belong in the same flight.

- **Effective values.** Each entrant is described by its bottle's own value, else its label's: proof, age, finishes, mashbill, distillery. Label-only entrants use the label's values. Ad hoc entrants have none.
- **Order.** Entrants are sorted by the tournament's `group_order` and cut into heats of `heat_size` in that order. The first key splits the field and each later key only orders bottles inside the groups before it, so what comes first matters most. Proof is first by default because bottles at different strengths are not a fair taste; with another key first, a flight can span a wide proof range (the flight header always shows its band).
- **Priority control.** A reorderable list of the five keys with move up and move down buttons (drag optional, per section 5), in setup and in the tournament's settings. Changing it is allowed at any time. It applies to rounds generated afterwards, and to the current round when you use *Reset to automatic*.
- **Multi-valued and missing keys.** A label with more than one distillery has the distillery value **Blend**, which is its own group, so multi-distillery products are matched with each other. A bottle with several finishes sorts by its first listed one. A missing value (no age statement, no finish, no proof, no mashbill) sorts after every known value for that key, never guessed. Mashbill applies to whiskey; for other spirits it is missing.
- **Boundaries.** A flight may straddle two groups of the first key, so a flight's generated label can fall back to its proof band.
- **Missing data.** An entrant with no proof sorts to the end as "unknown", and is never guessed. The preview shows how many entrants were grouped without full data.
- **Other spirits.** Proof is still the first key. Mashbill, finish and distillery apply when the label has them.
- **Deterministic.** Ties break by entry id, so the same entrants always give the same heats. That is what makes *Reset* return the original.
- **Pour order.** Open heats list their bottles from lowest to highest proof, for palate fatigue. Blind heats use random glass letters and suggest no order, because an order by proof would tell the taster which glass is which. A blind heat shows only its proof band (e.g. "90 to 100 proof"), which the grouping already implies.
- **Move.** An entrant can be moved to another undecided heat of the current round (before the tournament starts, the round-1 preview). A heat holds one to `heat_size` entrants, and an emptied heat is removed. Decided heats cannot change.
- **Reset.** Re-runs the grouping on the entrants of the current round's undecided heats and leaves decided heats alone.

## 5. Playing a heat

- **Open** (blind off): show the entrants' names and photos, rank them.
- **Solo blind**: choose a pending heat. Map each bottle to a letter (the covered lazy susan makes this physically blind), tap hide, rank the letters, reveal.
- **Pourer blind**: the pourer taps *Draw*, the server picks a pending heat of the current round at random and fixes the glass letters. The pourer sees which bottle is in which glass, then taps *Hand over*. The taster sees only letters, ranks them, and the reveal follows the result.
- In a blind tournament the heat list and match screens show no names until a heat is decided. The blinding is a user-interface contract between the people at the table. It is not a security boundary against the account owner.
- Ranking is forced with no ties. If you can't choose, leave the heat pending.
- **No drag-only controls.** Ranking the glasses and moving an entrant between heats each have button alternatives (move up and down; a Move menu) that work by keyboard and single tap, with drag as a shortcut on top (WCAG 2.2 AA, dragging movements). Phone controls are at least 44 pt, per `DESIGN.md` section 12.7.

## 6. Server

Routes under `/api/v1/tournaments`, used by web and iOS alike:

- create, list, get (with rounds and standings), delete (a draft or complete tournament)
- start (locks the field, generates round 1)
- record a heat result, undo, withdraw an entrant, draw a random heat, set glass letters
- move an entrant to another undecided heat, and reset the current round to the automatic grouping
- promote an ad hoc entrant to a label or one of your bottles
- ranking and audit (section 7)

Rounds, advancement, validation (strict ranking of exactly the entrants in the heat) and the draw are server-side. The pure modules (bracket generation, advancement, ranking fit) take plain data and have exact-answer unit tests.

## 7. Ranking and audit

**Ranking.** Every decided, non-bye heat from every tournament goes into one Plackett–Luce fit, computed on demand and never stored. Ad hoc entrants are excluded. Each competitor (a bottle, or a label-only entrant) gets a strength; the ranking is the order of strengths.

- **Prior.** A weak prior pulls strengths toward the average, so an undefeated bottle does not get an infinite strength.
- **Provisional.** Fewer than 3 heats shows as provisional, not as a firm rank.
- **Comparable groups.** Strengths are comparable only within a group linked by shared competitors. Competitors from unlinked tournaments are shown as "not yet comparable", never merged.
- **Category filter.** Rankings are viewed per category.
- **Known limit of palate-matched grouping.** With proof first (the default), because every round groups similar bottles, proof bands meet each other only in the last rounds, so strengths across bands rest on few heats and rely on the prior. Higher proof also tends to win head-to-head. The ranking and audit say so where it matters: a competitor whose heats all sit in one proof band is marked "single band", and the audit never compares across bands on its own. Choosing `random` seeding is the way to get more cross-band data.
- **Promotion** is retroactive for free: setting an ad hoc entrant's bottle or label makes its past heats count on the next fit.

**Audit.** For each competitor with a ranking and at least one rated tasting, compare its percentile in the ranking with its percentile by average 0–10 rating among the rated competitors in the same group. List the largest gaps first ("rated 9.0, ranks 14th of 40"). A bottle entrant uses tastings logged against that bottle; a label-only entrant uses that label's tastings with no bottle. Competitors with no rated tastings appear in the ranking but not the audit.

## 8. Surfaces

- **Web**: create a tournament (large field picker with filters, bracket preview of round 1 with later rounds as counts), run heats, the bracket view and standings, ranking, audit. Tournaments is a top-nav item beside Labels.
- **Bottom bar on long pages (web).** The setup preview and the bracket view carry a bar glued to the bottom of the window, with page up, page down and a Top button. Page up and down move one screen minus the bar's height, so no row is skipped under it. Top appears once you have scrolled half a screen, and its space is reserved so the bar does not shift. Page up and page down disable at the ends. On the setup preview the same bar also holds **Start tournament** and **Reset to automatic**. The bar is solid paper with a hairline top edge, no blur or shadow (`DESIGN.md` section 1). The page keeps scroll padding equal to the bar's height so keyboard focus is never hidden behind it (WCAG 2.2, focus not obscured), and smooth scrolling applies only when reduced motion is not requested. These are buttons in the bar, not floating buttons over the content, so they never cover a row's controls.
- **iOS**: the same, laid out for live tasting (glass-letter mapping, the pourer's hand-over, ranking with arrow buttons). **Tournaments lives under the Account tab**, not in the tab bar or the + sheet. The arrow buttons are drawn at 28 pt with a 44 pt hit area.
- **Label page**: one line, "Tournament rank: 3 of 41 bourbons", when the label or one of its bottles has a firm rank.

## 9. Provenance on label-page tastings (separate PR, first)

Today a label's tasting row carries only `bottleId`, so a tasting of a store pick looks the same as one of the standard bottling. The label tastings API returns a bottle summary (single barrel, private pick with pick name and picker, barrel number, release), and each tasting row shows it as a tag, on web and iOS. A tasting with no bottle has no provenance; giving a tasting its own provenance fields is not part of this.

## 10. Build order

| # | PR | Contents |
| --- | --- | --- |
| 0 | Provenance | Section 9. Useful alone; the audit relies on it. |
| 1 | Server core | Migration, pure modules and their tests, the routes in section 6, ranking and audit. |
| 2 | Web | Create, play, results, ranking, audit; a Playwright test of a full small tournament in both blind modes. |
| 3 | iOS | The same on the phone, built once the web flow is proven. May split in two. |

## 11. Not in this design

Group voting. Adding entrants after the start. Tastings with their own provenance. Writing the ranking back into ratings. A live Beli-style insertion ranking. A drawn bracket tree.

## 12. Open points

- A bottle deleted after it entered a tournament leaves an entry with only its label, so it falls into the label-only competitor for that label. Accepted for now; its display name keeps the history readable.
- The ranking prior's strength is chosen when the fit is written and tested against fixtures.
- Heat size tops out at 4. A larger susan would need a larger maximum, and the data model already allows it.
