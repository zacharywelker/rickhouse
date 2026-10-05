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

**Section citations in code.** Comments in `src/` that cite a section of
`DESIGN.md` (for example "DESIGN.md §29" or "§38") refer to the previous,
archived document, whose numbering is different. Look them up in
`archive/DESIGN-2026-09-swiss-field-guide.md`. Citations of
`docs/DESIGN-TOKENS.md` sections are mostly still valid, because the unchanged
sections kept their numbers; sections 3.2, 7, 9, 27 and 28 were replaced.

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

Light mode is the default: warm paper `#F6F1E7` ground, navy ink `#14213D`.
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
- Several colors are faint on paper (Gin, Bourbon, Irish, Intl whiskey, Other
  are under 2:1). Every frame carries a 1px ink hairline *(proposed)*.
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
(6 to 8 px at card scale, to be tested *(proposed)*). When background removal
ships, the frame's interior fills with the same color and becomes a plate. A
plate means a cutout succeeded; otherwise the card shows the plain frame.

## 4.3 The card

| Part | Content |
|---|---|
| Photo | Portrait, in the category frame |
| Name | Up to 2 lines |
| Category name | Printed on or beside the frame |
| Fact slot | One fact of about 14 characters *(proposed)* |
| Mark slot | Optional; only when a mark applies |
| Fill cue | A thin gauge along the frame edge |

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
- **What to drink tonight:** spirit, then proof point, then flavors, with
  "Spin the bottle" as a fully random option. Flavors appear only once the user
  has at least 25 tastings, gated per spirit; otherwise the screen asks "Time
  to open a new bottle?".

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

# 12. Not yet revisited

These topics exist in `archive/DESIGN-2026-09-swiss-field-guide.md` and have not
been reviewed against this direction: forms, destructive actions, notifications,
empty states, loading, onboarding, bottle detail and history, fill level,
locations, search and filtering, motion, sound and data visualization. Until
revisited, use them as background only.

---

# 13. Open decisions

Marker typeface and tape look; dark-mode palette; brandy and Other card facts;
outline vs filled tab icons; Android and web icon sets; frame thickness;
voice guide; whether desktop has a gallery view. The owner and trigger for each
are listed in section 15 of the design-language spec.
