# Fill level: the fine-tick dial, the sealed state, and the tasting nudge

Status: draft for approval. Web and iOS.

## Intent and why

A bottle's fill level is a **reference**, not a measurement. People set it roughly when they add a bottle and when they open it, and glance at it later to see "about half". It has to be quick to guess, easy to read, and cheap in screen space. It must not pretend to be precise (no percentages on screen) and must not be wrong in a way the owner can't see.

We looked at 23 ideas (dial variants, pour counts, shelf of glasses, moon, candle, record player and more) and chose the **fuel dial with fine ticks**. Pour-count styles read best but depend on every drink being logged; people won't log religiously, so a level driven by logged pours would drift and be confidently wrong. The dial is read and set by eye, so it stays true whatever the owner logs.

## Goals

1. **One dial everywhere.** The same half-circle fuel dial on the bottle page (web and iOS) and, smaller, in web lists, grids, tables and group cards. Empty at the left (E), Full at the right (F), needle straight up at half.
2. **Fine ticks.** Twenty small ticks, one every 5%, with labels at E, ¼, ½, ¾ and F. Tap or drag on the dial and the needle detents to the nearest tick, so any 5% step can be set, not only the six quick states used today. The needle swings with a short spring overshoot (not when the OS asks for reduced motion). On iOS each tick gives a light haptic.
3. **Open versus sealed is visible.** A sealed bottle shows a hatched, unreadable dial with a wax seal where the needle would be. An open bottle shows the live needle. There is **no "Open" chip and no "open since" date on the dial**; the opened date already appears elsewhere on the bottle page.
4. **Low fuel is visible.** The sweep and needle zone turn red below the same line the quick states use between Almost gone and ¼ (18%). Colour is never the only cue: the readout also says it in words.
5. **A nudge after a tasting.** After the owner saves a tasting that came from one of their own bottles, the app shows that bottle's dial and invites them to adjust it. Nothing changes unless they move it.

## Non-goals

- Pour counts, pour sizes, bottle-size scaling, and any "N drinks left" display.
- Automatically lowering the level when a tasting is logged. The level only changes when the owner sets it.
- Using or changing the unused `pours` table.
- A suggested new level in the nudge: it shows the dial and the owner moves it.
- Nudging for tastings that did not come from an owned bottle (bar, bottle share, sample, store pour, "not from my collection").
- Changing the iOS thin ink capsule gauges on cards, Tonight and the tasting-log bottle choice. They take almost no space and a 3pt dial is unreadable.

## Anti-goals (would make this a failure even if it technically works)

- A level that changes without the owner doing it.
- False precision: a percentage, or "63%", shown anywhere as the headline.
- A control that costs the bottle page more vertical space than it does now.
- A gimmick that is slower to set than the grid it replaces.
- Changing the stored value. It stays an integer percent, 0 to 100, in `fill_pct`.

## Current state (so the builder knows the starting point)

- A first version of this work exists **uncommitted in the worktree** `bridge-cse_01QZZCFQY9tAimYDb7B9C2WF` on branch `worktree-bridge-cse_01QZZCFQY9tAimYDb7B9C2WF`: a half-dial `FillGauge` (`src/components/bottles/fill-gauge.tsx`), dial geometry in `src/lib/bottles/geometry.ts` (`needleDeg`, `pctFromDial`), `FillControl` without the six-button grid, the hero "No photo yet" placeholders, and an iOS `FillPicker` dial in `ios/Rickhouse/FillState.swift`. It detents to the **six quick states**, has **no sealed state** and **no ticks beyond six**. This design changes those three things and adds the nudge.
- The bottle silhouette gauge and the six-button grid are gone in that work; nothing here brings them back.
- Web tastings are logged **on the bottle page** (`src/components/expressions/tasting-notes.tsx`, `saveTastingNoteAction`), directly beside the fill control. iOS logs them through `LogTastingFlow` / `TastingFormView`, which asks which owned bottle it was ("Not from my collection" is an option).
- A tasting stores an optional `bottle_id` and a `source` (`owned`, `bar`, `bottle_share`, `sample`, `store_pour`). Choosing an own bottle sets `owned` automatically.
- The server already treats setting a level below full on a sealed bottle as opening it (`setBottleFillAction` / `api.setFill`). The web also has an Opened checkbox and an editable opened date. Reaching 0 on web asks "Mark it killed?".

## Behaviour

**The dial**
- Value: integer percent 0 to 100. Ticks every 5%; major ticks (longer) at 0, 25, 50, 75, 100.
- Pointer or touch (tap or drag) sets the nearest 5%. Under about 3% from the left end it reads as 0 (Empty), so a drained bottle can be set to empty rather than stopping at 5%.
- A stored value that is not on a tick (for example an imported 63%) shows the needle at its exact position. The first interaction moves it to a tick.
- Words next to the dial: keep the existing six states and wording (Full, ¾ full, ½ full, ¼ full, Almost gone, Empty), chosen by the existing bands. They are deliberately coarse ("about half").
- Accessibility: the web dial is a slider with value text in words; the arrow keys move one tick (5%), Shift moves a quarter, Home and End go to Empty and Full. On iOS, VoiceOver's adjustable action moves one tick up or down. Reduced motion removes the spring and the haptic ticks follow the system setting.

**Sealed**
- Sealed means the bottle is not open. The dial shows the hatched track and seal and no needle, and reads "Sealed" in words.
- Moving a sealed dial opens the bottle (the existing server rule). On web the Opened checkbox continues to work as today.
- Small sizes (lists, tables, cards) show the hatched track only, without the seal icon, which would be unreadable there.

**The nudge**
- Trigger: a tasting is saved with a bottle that is the owner's own (source `owned`), the bottle is not killed, and the tasting is new (not an edit of an old one).
- iOS: after the tasting saves, before the sheet closes, show the bottle's dial with a short prompt ("How much is left?") and a Done button. Skipping leaves the level unchanged.
- Web: the tasting form is already on the bottle page next to the dial, so after a successful save the dial area is briefly highlighted with the same short prompt. It dismisses on interaction or after the owner navigates away.
- No suggested level. The dial starts at the current level.
- If the owner moves the dial in the nudge, it is the same write as the normal fill control (same server rules: opening a sealed bottle, the empty-bottle "mark it killed" prompt on web).

## Out of scope for the builder to decide

- Exact animation timing and spring constants, tick lengths and stroke widths, and spacing at each size: use what the first version does and adjust by eye.
- Visual treatment of the nudge prompt (sheet, inline card): follow existing patterns on each platform.

## Decisions I made (not yet confirmed with the owner)

1. Readout words stay on the existing six states, not eighths ("⅝"). The mockups showed "About ⅝", but one wording across labels, tournaments and VoiceOver is simpler and matches DESIGN.md §21's "about half".
2. The arrow keys move one tick (5%) rather than 1%, since 1% is below what the dial can show. The end-to-end specs that assume 1% steps change.
3. A sealed dial opens the bottle on first move (existing server behaviour), rather than needing a separate gesture.
4. The nudge is for new owned-bottle tastings only.
5. iOS thin capsule gauges stay as they are.
6. Small sealed dials drop the seal icon.

## How we will know it works

- A tasting saved from an owned bottle shows the dial; moving it changes `fill_pct`; skipping does not.
- A tasting from a bar, sample or "not from my collection" shows no nudge.
- Every tick from 0 to 100 can be set by tap on both platforms; the stored value round-trips.
- A sealed bottle renders hatched with no needle at every size; opening it shows the needle.
- Existing flows still pass: the keyboard slider, the empty-bottle "mark it killed" prompt, the Opened date.
