# Rickhouse — Design System

> **The back bar, annotated.**
>
> Take the collection seriously. The connoisseur is not serious.

This is the canonical visual and interaction direction for Rickhouse on web,
iOS and Android. It replaces the earlier Swiss field-guide direction, kept in
`archive/DESIGN-2026-09-swiss-field-guide.md`. The decision record and its
reasoning are in `docs/superpowers/specs/2026-10-05-design-language-design.md`.

**Implementation status.** The web app still implements the previous direction
(pastel painter's tape, Aileron and Georgia, the old nine-color category
palette, the Char Level stave drawing). This document describes the target.
Moving the code to it is the web redesign, which is its own spec. Until a
component is migrated, do not copy its old styling into new work.

Items marked *(proposed)* were introduced to make a decision work and still
await the owner's confirmation. Items marked *(undecided)* are open; see
section 13.

---

# 1. Thesis and principles

The records, photos and numbers are precise. The personality comes from voice,
and from a few facts written the way a bartender writes them.

1. **The bottle is the hero.** Photo first, in a frame colored by category.
2. **Structure is quiet.** Paper and ink, one grid, tabular figures. A serif is
   used only for headlines.
3. **Color has one job: category.** It appears on photo frames, one swatch
   beside the category name, and in charts. Everything else is paper and ink.
4. **The voice lives in headlines,** written from the user's own data, in the
   serif. Never in marker.
5. **Marks are facts.** Tape and marker appear only where a person would really
   write on a bottle (section 5).
6. **One identity, native chrome.** Tab bars, navigation bars and sheets follow
   iOS and Android, with the raised + button as one deliberate exception.
7. **Light first, dark as a sibling.** Dark is designed alongside light, not
   derived by inversion.

No loud treatments for anything a user sees daily.

## Inspiration, and what to avoid

Borrow the rule, not the look. **Penguin paperbacks:** category as a learnable
color system, plain confident type, a lot of paper. **Letterboxd:** a grid of
the things themselves is fun to browse, and logging is quick. **A physical
field guide (the book):** structure only.

Avoid: Rick the mascot, app-drawn decoration, scrapbook layouts, naturalist or
specimen styling, color floods, gradients, glass and frosted surfaces,
rounded-card soup, Wrapped-style loud numbers as an everyday tone, and generic
SaaS styling.

---

# 2. Typography

- **Sans: Inter.** All UI, data, tables, labels, controls and numbers. Tabular
  figures wherever numbers are compared.
- **Serif: Source Serif 4.** Headlines and short editorial lines only. Not for
  data, controls or body copy. Lining figures, and the display optical size for
  headlines *(proposed)*.
- Both are free and open-licensed, bundled with the apps and subset to the
  languages needed *(proposed)*.

Hierarchy comes from size, weight, spacing and alignment, not from more fonts.

---

# 3. Color

## 3.1 Surfaces

Light mode is the default: warm ivory paper `#FFF8E7` ground, navy ink `#14213D`.
Dark mode is a designed sibling; its palette is *(undecided)*.

## 3.2 Category palette

Sixteen categories. Whiskey kinds each have their own color.

| Category | Hex | Text on it |
|---|---|---|
| Vodka | `#56B7E6` | ink |
| Gin | `#48D597` | ink |
| Rum | `#9678D3` | ink |
| Bourbon | `#FC9350` | ink |
| Rye | `#1CAA3D` | ink |
| Scotch | `#F4633A` | ink |
| Irish whiskey | `#A6DD45` | ink |
| Japanese whiskey | `#BA0C2F` | paper |
| American whiskey (other, ASM, ALW, corn) | `#CA9A8E` | ink |
| Canadian whiskey | `#5461C8` | paper |
| International whiskey | `#EAB8E4` | ink |
| Amaro | `#EF426F` | ink-on-color |
| Liqueur | `#E93CAC` | ink-on-color |
| Agave (tequila, mezcal) | `#50A684` | ink |
| Brandy | `#61007D` | paper |
| Other | `#F7EA48` | ink |

The values come from Pantone references; the hex values are the source of truth
in the app. Residual categories (American whiskey, International whiskey, Other)
are deliberately quieter than the named kinds.

## 3.3 Rules

- Text on color must reach 4.5:1. Amaro and Liqueur reach only 4.3:1 with
  standard ink, so text on colored frames uses a slightly darker
  **ink-on-color** token, about `#0A1226` *(proposed; verify the value)*.
- The category name is always printed with the color. Color is never the only
  cue. Red-green color blindness makes Amaro/Agave and Amaro/Rye close.
- Several colors are faint on paper (Gin, Irish, Intl whiskey, Other are under
  2:1). Every frame carries a 1px ink hairline *(proposed)*.
- Do not use category colors as text on light backgrounds.

---

# 4. Photography and the bottle card

## 4.1 Photography

Almost every bottle has a photo; it is the primary visual. Native apps capture
in-app with a guided frame (silhouette and a fixed portrait crop). The
background is kept as shot for now. GPS and other location metadata are
stripped, uploads are resized, and thumbnails are cached.

## 4.2 Frame and plate

The photo sits in a category-colored frame, thick enough to read as a mat
(6 to 8 px at card scale, to be tested *(proposed)*). A cutout fills the frame
and becomes a plate: a wall in the category color over a floor in a darker
shade of it. Every bottle's base sits on the same line inside the floor, so
bottles of different shapes read as one set. This needs the cutout trimmed to
the bottle, so its bottom edge is the base. A plate means a cutout succeeded;
otherwise the card shows the photo in the plain frame, with no floor. Each
frame carries a flat 2 px offset shadow in ink at 18%, with no blur
*(proposed)*, so the grid has depth without gradients.

## 4.3 The card

| Part | Content |
|---|---|
| Photo | Portrait, in the category frame |
| Name | Up to 2 lines |
| Category name | Printed on or beside the frame |
| Fact slot | One fact of about 14 characters *(proposed)* |
| Mark slot | Optional; only when a mark applies |
| Fill cue | A "40% left" chip under the facts, only when the bottle is under full *(proposed)* |

Default fact per category: whiskey (all kinds) proof, then age statement, then
mashbill; rum age; agave expression (blanco, reposado, anejo); gin style;
vodka base ingredient; liqueur flavor; amaro region; brandy and other
*(undecided)*. A slot is never blank: if the fact is missing, show the next in
that category's priority list *(proposed)*.

Density is user-selectable: 3 columns (default on phones) show photo, name and
one fact; 2 columns show two facts; a wide gallery shows three.

---

# 5. Marks

Tape and marker appear only for facts a person would write on a real bottle:
**open date, gifted-by, store pick, location.**

- Each mark is a component with a fixed slot, never placed by hand.
- Tilt at most 2 degrees. Marks never overlap content or touch targets.
- Each has a plain-text equivalent for assistive technology.
- They scale with system text size up to a cap *(proposed)*.
- The marker typeface and the look of the tape are *(undecided)*.

---

# 6. Views and layout

- **Desktop:** dense table by default.
- **Phone:** gallery by default (3 columns, user-selectable), with an
  "in-depth" dense-list mode behind a small floating `tablecells` button at the
  bottom right.
- Spacing is a 4px-based scale: 4, 8, 12, 16, 24, 32, 48 *(proposed)*. Tight
  inside a group, generous between sections.
- Containers communicate a real relationship. Do not wrap everything in cards.

---

# 7. Navigation

**Desktop:** Collection, Labels, Groups, Numbers, and a user menu containing
Settings (Config moves into it).

**Mobile tab bar,** five icon-only slots (iOS SF Symbols shown):

| Slot | Icon | Destination |
|---|---|---|
| 1 | `square.grid.2x2` | Collection |
| 2 | `text.magnifyingglass` | Labels (a searchable history of tastings) |
| 3, center, raised | `plus.circle.fill` | The + sheet |
| 4 | `chart.bar.fill` | Numbers |
| 5 | `person.circle.fill` | Account |

Every icon has an accessible name; targets are at least 44 pt (iOS) and 48 dp
(Android). Outline vs filled for the selected state is *(undecided)*. The
Android and web icon sets are *(undecided)*.

The **+ sheet** offers Add a bottle, Log a tasting, and What to drink tonight.
**Account** shows the profile picture (initials until set *(proposed)*), the
name, then Account, Preferences, Groups and Config (admins only *(proposed)*).

---

# 8. Core flows

- **Add a bottle** and **Log a tasting** begin with a search box and a barcode
  scan button. Lookup is local to the user's own data for now. A tasting
  belongs to a label and optionally to a bottle. Tasting notes are chosen from a
  fixed vocabulary per category; free text stays with the user.
- **What to drink tonight** *(phone only)*: spirit, then proof point, then
  flavors, one step per screen, ending on one bottle. **Roulette** is the fully
  random option at the foot of every step. Flavors appear only once the user has
  at least 25 tastings, and 10 of the chosen spirit; otherwise the screen asks
  "Time to open a new bottle?". Flavors and freshness only nudge a weighted
  draw. A pick can be declined (**Not this one**) or **muted** for up to three
  months, synced with the account. Open bottles by default; sealed ones are an
  explicit switch. Decisions and rules:
  `docs/superpowers/specs/2026-10-08-tonight-design.md`.

---

# 9. Voice

Personality lives in serif headlines and short quips written from the user's
own data ("Kentucky leads, 17 to everybody else."). Never decorative, never
marker. Detailed voice rules are *(undecided)*; a voice guide is a follow-up.

---

# 10. Accessibility

WCAG 2.2 AA is the minimum. Color is never the only indicator. Respect system
text size, reduced motion and contrast preferences. Touch targets of at least
44 pt and 48 dp. Every mark and icon has a text equivalent.

---

# 11. Decision order

1. What does the user need to know or do?
2. Establish hierarchy with type, spacing and alignment before decoration.
3. Is the bottle the hero?
4. Is color doing only category?
5. Is any mark a real fact a person would write on a bottle?
6. Is personality in the headline voice, not in decoration?
7. Does it work on a phone and with large text?
8. Remove anything that exists only because it looks cool.

---

# 12. Interface rules, and what is not yet revisited

Rules for forms, rows, pickers, questions and messages. They are written for the
iOS app from the shipped screens (issue #209); Android follows them. Every rule
is *(proposed)* until the owner confirms it. Where the web differs, it says so.
The screen-by-screen audit is in
`docs/superpowers/specs/2026-10-12-ios-uniformity-inventory.md`.

**Shared pieces.** Each rule below names the one component that draws it. A
screen that needs the thing uses the component; it does not draw its own.

## 12.1 A fact as a row

- One layout for reading and editing: the name on the left in muted Inter 15,
  the value on the right in ink, at least 44 pt tall. Editing changes the value
  into a field in the same place; the row does not move.
- Rows sit in a list section with a hairline between them. No tinted panel,
  no dashed or ruled box around facts.
- A changed fact in edit mode shows a dot, the old value ("was ...", struck
  through) and a put-back button. A form for something new has none of these:
  there is nothing to put back.
- A price shows its currency symbol against the amount, focused or not, and
  stops at two decimals as you type.
- A fact with no value is not drawn when reading, and is offered under "Add a
  detail" when editing.
- Web: the same name-then-value order, but rows are table cells or `Field`
  blocks (`src/components/forms/field.tsx`) with the label above the input.

## 12.2 Dates

One date row everywhere: "Add date" when empty, then a compact date picker and
a clear button. No switch-plus-picker. A date never lies in the future unless
the fact is about the future (a mute's end).

- Web: the native `<input type="date">`, which already matches.

## 12.3 Choosing from a list

- A short, closed set (about seven or fewer, known in advance): a menu or
  segmented control.
- A long or open set: a row showing the current value and a chevron, opening a
  sheet with the system search field. Typing a name that does not exist offers
  to add it when that kind of thing can be added.
- One exception: a name that is usually new (the brand on New Label) is typed into the form with suggestions
  below it, because the typed text is the main path and picking an existing one is the shortcut.
- The flavor wheel is its own screen because it is a different task, not a
  different picker.
- Top-level screens (Collection, Labels) use the in-page `SearchField`. Sheets
  and pushed pickers use the system search field. Never both on one screen.
- Web: a combobox popover (`command.tsx`).

## 12.4 Questions and confirmations

- Any question that discards work or deletes something is the bottom
  `ConfirmSheet`: a serif title, one line of consequence, the destructive
  button in the error color, then Cancel. The system `confirmationDialog` is
  not used: on iPhone it can lose its cancel button inside a sheet.
- A question with more than two answers is a sheet with one button per answer
  and Cancel last.
- Deleting from a list is swipe-to-delete, which asks with the same sheet.
- System alerts are only for a text prompt the system needs (typing a barcode).
- Web: `window.confirm` today; moves to the dialog component (`ui/dialog.tsx`)
  in the web redesign.

## 12.5 Saying what happened

One bar at the foot of the screen, one component, three kinds:

| Kind | When | Has |
|---|---|---|
| Undo | Something saved that can be put back | message + Undo button |
| Notice | Something done that cannot be put back | message |
| Error | An action the person just took failed | warning icon + message + Retry (always) |

- The bar goes away on its own after a few seconds, except Error, which stays
  until dismissed or the action succeeds. It is announced to VoiceOver.
- A form that cannot save shows `ErrorText` inline, above the Save button, and
  keeps what was typed. A field problem shows under that field.
- No alert for a failure; the person is already looking at the screen.
- Web: inline `role="alert"` text (`border-destructive` block). There is no
  toast; the web has no undo.

## 12.6 Section titles

- A section label in a list or form is small uppercase Inter 12 semibold,
  tracked, in muted ink. It may carry one action on its right ("Edit"), which is
  a 44 pt target.
- The serif is for a page's headline and short editorial lines (section 9),
  never for labels like "Fill level" or "About this label".
- Web: `ui/section.tsx` titles follow the old direction until migrated.

## 12.7 Shape, chips and touch

- One corner radius, 8 pt, for bars, panels and sheet buttons, with no exceptions except photo and thumbnail frames, which
  follow section 4.
- A chip is a capsule.
- The visible shape may be smaller than 44 pt; the tappable area is not
  (`contentShape`).
- Loading is a centered spinner. Empty and failed states use the system empty
  view with one line of cause and, if there is one, one action. A screen never
  shows "0" or "No ..." before the first fetch finishes.
- At the largest accessibility text size, a row's name and value stack
  instead of truncating.

## 12.8 Still not revisited

These topics exist in `archive/DESIGN-2026-09-swiss-field-guide.md` and have not
been reviewed against this direction: onboarding, bottle detail and history,
fill level, locations, search and filtering (beyond 12.3), motion, sound and
data visualization. Until revisited, use them as background only.

---

# 13. Open decisions

Marker typeface and tape look; dark-mode palette; brandy and Other card facts;
outline vs filled tab icons; Android and web icon sets; frame thickness;
voice guide; whether desktop has a gallery view. The owner and trigger for each
are listed in section 15 of the design-language spec.

---

# 14. Brand mark

The logo is a barrel head: a circle of five equal vertical planks with the
center plank in orange, set beside the name in capitals. It follows section 1:
flat, no gradients, no mascot, no decoration.

- **Mark.** Five equal planks, with a gap of 7.6% of the radius. The outer four
  are ink (ivory on dark); the center plank is Bourbon orange `#FC9350`.
- **Wordmark.** RICKHOUSE in capitals, Source Serif 4 SemiBold (600), optical
  size 36, tracking +0.038 em. It is the one use of the serif that is not a
  headline. The files carry it as outlines, so no font is needed to display it.
  The display optical size (60) was tried and rejected: its hairlines are too
  thin at small sizes.
- **Color.** Ink `#14213D` and paper `#FFF8E7`. The same ivory is the app's light
  ground and the "white" of the dark logo, so the logo and the app share one
  white.
- **Default.** The light logo (ink on ivory) is the default. The dark logo is
  ivory on ink. Its navy ground belongs to the logo; it is not the dark-mode
  palette, which is still *(undecided)* (section 13).
- **Lockup.** Head diameter is 1.96 times the wordmark's cap height, the gap to
  the wordmark is 0.62 times the cap height, and clear space is one head radius
  on every side. Checked at 180 px wide (lockup) and 32 px (head alone); smaller
  sizes are untested.
- **App icon.** The head alone, centered, on ivory (light, the default) or ink
  (dark).
- **Secondary icons** *(proposed uses)*. The key, with the head inside its bow
  and drawn dark, for connecting to or unlocking a server. A card with spin
  arrows for *Roulette*, in What to drink tonight (its button, and its loading
  screen, where the card spins). A wheel with a pointer is spare, and the + sheet's
  *What to drink tonight* row needs art of its own *(undecided)*. Each is centered in
  its icon box and uses only ink, ivory and orange.

The source files and a usage table are in `docs/brand/`. They were generated,
not drawn in a design tool; have a designer redraw them in a vector tool before
print or trademark use.
