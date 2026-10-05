# Rickhouse Design Language

Status: draft for review. Date: 2026-10-05.

This spec replaces the visual and interaction direction in `DESIGN.md` (the
Swiss "field guide" direction). It covers the design language only: identity,
principles, color, type, photography, the bottle card, collection views and
navigation and the core flows (add, log a tasting, what to drink tonight). It
does not cover individual screens beyond the Collection card, the tab bar and
those flows; those are follow-up specs (section 16).

Provenance tags used below:
- **Decided**: stated by the owner during the brainstorm.
- **Proposed**: introduced by the author of this spec as the smallest rule that
  makes a decision work. Each one needs the owner's confirmation in review.

---

## 1. Purpose and scope

Rickhouse is moving from a web-only, self-hosted tracker to a product with
native iOS and Android apps. The existing design direction felt generic and
internally inconsistent, and it does not translate to a native app. This spec
sets one direction that works on web (desktop and phone browser) and in the
native apps.

In scope: the design language, as rules and tokens. Out of scope: screen-by-screen
layouts other than the Collection card and navigation, the native API, the data
model changes beyond what the card needs, and motion.

Platform stance (Decided): native iOS and Android are planned. The product is
self-hosted first, with an optional hosted service later. The design language
is platform-neutral (tokens and rules), and navigation chrome follows each
platform's conventions.

Run modes (Decided): the native apps work standalone with all data on the
device, or connect to the user's own home server (strongly recommended), or,
later, to a hosted service. With a server, the server holds the truth. Section
14.6 gives the rules.

Product sequence (Decided), used to decide what to build now and what to leave
a seam for:
1. Bottle management.
2. A tasting log.
3. A source of truth for your liquor: a central catalog the owner hosts.
4. An "Untappd for spirits": social features. This is far in the future and is
   not committed.

This spec designs for stages 1 and 2 and leaves seams for 3 and 4 (section 14).

## 2. Thesis (Decided)

**The back bar, annotated.** Take the collection seriously; the connoisseur is
not serious. The records, photos and numbers are precise. The personality
comes from voice and from a few facts written the way a bartender writes them.

## 3. Principles

1. **The bottle is the hero.** Photo first, in a frame colored by category.
2. **Structure is quiet.** Paper and ink, one grid, tabular figures. A serif is
   used only for headlines.
3. **Color has one job: category.** It appears on photo frames, one swatch beside
   the category name, and in charts. Everything else is paper and ink.
4. **The voice lives in headlines.** Written from the user's own data, in the
   serif. Never in marker.
5. **Marks are facts.** Tape and marker appear only where a person would really
   write on a bottle (section 7).
6. **One identity, native chrome.** Tab bars, navigation bars and sheets follow
   iOS and Android, with the raised + button as one deliberate exception
   (section 11.2). The brand lives inside the content.
7. **Light first, dark as a sibling.** Dark mode is designed alongside light,
   not derived by inversion.

No loud treatments for anything a user sees daily (Decided). If a loud moment
is ever wanted, it is rare and opt-in; whether it exists is open (section 15).

## 4. Inspiration and anti-references (Decided)

Borrow the rule, not the look:
- **Penguin paperbacks**: category as a learnable color system, plain confident
  type, a lot of paper.
- **Letterboxd**: a grid of the things themselves is fun to browse, and logging
  an entry is quick.
- **A physical field guide (book)**: structure only. A structured entry per
  item and an index.

Excluded: field-guide and naturalist apps (generic and impersonal), Wrapped-style
loud numbers as an everyday tone, and the back bar as a literal visual
(it appears only through the marks in section 7).

Removed from the old direction: Rick the mascot, app-drawn tape and Sharpie as
decoration, Swiss-grid-as-identity, scrapbook layouts, naturalist and specimen
styling, color floods, gradients, glass and frosted surfaces.

## 5. Typography

- **Sans: Inter** (Decided). All UI, data, tables, labels, controls, numbers.
  Tabular figures wherever numbers are compared.
- **Serif: Source Serif 4** (Decided). Headlines and short editorial lines only.
  Not used for data, controls or body copy.
- Lining figures are the default in the serif, so headline numbers match
  Inter's digits (Proposed; it follows from the font choice).
- Use the serif's optical-size axis: the display cut for headlines (Proposed).
- Both fonts are free and open-licensed. They are bundled with the apps, subset
  to the needed languages (Proposed).
- Type scale values and line heights are set when tokens are written.

Rejected after a side-by-side specimen: Junicode. Its default old-style
numerals clash with Inter's digits in count-heavy headlines, and its files are
large.

## 6. Color

### 6.1 Surfaces (Decided direction, values proposed)

Light mode is the default: warm paper `#F6F1E7` ground, navy ink `#14213D`.
Dark mode is designed as a sibling (section 6.5).

### 6.2 Category palette (Decided)

Sixteen categories. Whiskey kinds each have their own color. Colors are the
owner's selection. Rum, Canadian whiskey, American whiskey, Amaro, Agave and
Brandy were revised after a contrast and separation check; the values below are
the owner's final ones.

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

The values were chosen from Pantone references; the app uses the hex values
as the source of truth.

Amaro is its own category (Decided), which means a new category and field
group in the database.

### 6.3 Text on color (Proposed)

- Every pairing must reach 4.5:1 for normal text.
- Amaro and Liqueur reach only 4.3:1 with standard ink. Define a slightly
  darker **ink-on-color** token (about `#0A1226`, roughly 5.0:1 by calculation)
  for text on colored frames. Verify the exact value when tokens are written.
- Japanese, Canadian and Brandy take paper-colored text.

### 6.4 Known weaknesses (design around them)

- Closest pairs: Amaro and Liqueur (9.6) are both rose-pinks; Scotch and Amaro
  (9.9) are close. Check side by side in the real grid.
- Red-green color blindness: Amaro with Agave (3.7) and Amaro with Rye (4.0)
  are close. The category name is therefore always printed with the color.
  Color is never the only cue.
- Vodka, Gin, Bourbon, Irish, International whiskey and Other have only 1.1 to
  2.0 contrast against paper, and American whiskey, Rye, Scotch and Agave are
  under 3. Frames must be thick enough to read, and every frame carries a
  1px ink hairline outline for consistency (Proposed).
- Residual categories (American whiskey, International whiskey, Other) are
  deliberately quieter than the named kinds (Proposed principle).

### 6.5 Dark mode

Designed as a sibling. The dark-mode palette is not defined here (section 15).
It is known that the dark colors (Brandy, Japanese, Canadian) will need lighter
variants on a dark ground.

## 7. Marks (Decided rule)

Tape and marker appear only for facts a person would write on a real bottle:

1. Open date
2. Gifted-by
3. Store pick
4. Location (for example, back bar)

Rules:
- Each mark is a component with a fixed slot, never placed by hand.
- Tilt at most 2 degrees. Marks never overlap content or touch targets.
- Each mark has a plain-text equivalent for assistive technology.
- Marks scale with system text size up to a cap, not freely (Proposed).
- The app's own voice never appears as marker.
- The marker typeface and the look of the tape (color, texture) are open
  (section 15).

## 8. Photography and capture

Almost every bottle has a photo, so the photo is the primary visual (Decided).

### 8.1 Capture (Decided)

- In-app camera on the native apps. A guided frame (a bottle silhouette and a
  fixed portrait crop) gives consistent framing. Backgrounds are kept as shot.
- Background removal is added later. Until then the frame is a colored border
  around the photo (Decided).

### 8.2 Frame and plate

- The frame is category-colored and thick enough to read as a mat (Proposed
  range to test: 6 to 8 px at card scale).
- When background removal ships, the frame's interior fills with the same
  color and becomes a plate. The footprint does not change.
- A plate means a cutout succeeded. If it fails (clear glass is the likely
  case) or the device cannot do it, the card shows the photo in the plain
  frame (Proposed).

### 8.3 Processing (Decided)

- GPS and other location metadata are stripped. The server already does this
  (it re-encodes without keeping metadata; see `src/lib/images.ts`). Keep that
  behavior and pin it with a test. Also strip on the phone before upload, so a
  hosted service never receives location data (Proposed).
- Uploads are resized. The server already stores originals at up to 2000 px
  as WebP and creates a 480 px thumbnail. The current 10 MB upload cap would
  reject some full-resolution phone photos, so native clients must downscale
  before upload.
- Thumbnails are cached. The native apps need several thumbnail sizes (not
  just 480 px) and an on-device cache. Thumbnail names are UUIDs and never
  change, so they can be cached aggressively. Whether the image route already
  sends suitable caching headers has not been checked.

## 9. The bottle card

A fixed template. Only the content of the fact slot varies by category.

| Part | Content | Varies by category |
|---|---|---|
| Photo | Portrait, in the category frame | No |
| Name | Up to 2 lines | No |
| Category name | Printed on or beside the frame, so color is never the only cue | No |
| Fact slot | One fact of about 14 characters (Proposed limit) | Yes |
| Mark slot | Optional; only when a mark applies (section 7) | Appears when relevant |
| Fill cue | A thin gauge along the frame edge | No |

### 9.1 Default fact per category (Decided)

| Category | Fact |
|---|---|
| All whiskey kinds | Proof, then age statement, then mashbill |
| Rum | Age |
| Agave | Expression (blanco, reposado, anejo and so on) |
| Gin | Style (London dry, modern, Old Tom and so on) |
| Vodka | Base ingredient |
| Liqueur | Flavor |
| Amaro | Region |
| Brandy | Not decided |
| Other | Not decided |

The whiskey kind is carried by the frame color and the printed name, so the
slot can show a data fact.

### 9.2 Fallback (Proposed)

A slot is never blank. If the preferred fact is missing, show the next one in
a per-category priority list (for example Rum: age, then origin, then proof).

### 9.3 Density (Decided)

The number of facts depends on grid density, selectable by the user:

| Grid | Shows |
|---|---|
| 3 columns (default on phones) | Photo, name, one fact |
| 2 columns | Photo, name, two facts |
| Wide gallery | Photo, name, three facts (for whiskey, mashbill appears here) |

Defaults live in a per-category setting, which fits the existing
`categories.field_group` model. Making it user-editable is later.

### 9.4 Data gaps

The schema has no columns today for gin style, vodka base, liqueur flavor,
or amaro region, and no field group for amaro. Agave has `agave_type`, but
whether it holds species or expression has not been checked. Closing these
gaps (new columns and a hand-written migration) is a prerequisite for the card
showing those facts. Amaro's default (region) will mostly read "Italy" and may
turn out to be a poor fact; revisit after real data.

## 10. Collection views (Decided)

- **Desktop:** dense table by default. There is more horizontal room.
- **Phone:** a gallery of bottles by default, 3 columns, user-selectable
  density. An "in-depth" mode (a dense list, one row per bottle, every key
  field) is reached through a floating button (section 11.8).
- Letterboxd's browsing feel is the model for the phone grid.

Consequence to watch: the table is the default on desktop, so the colored
frames do not appear on desktop's main view. Identity there rests on
typography, the palette on swatches and charts, and marks. Whether desktop has
a gallery view at all is open (section 15).

## 11. Navigation and core flows (Decided)

The job ranking behind the structure (Decided): look something up, then add a
bottle, then decide what to drink, then admire the collection.

### 11.1 Desktop

Collection, Labels, Groups, Numbers, and a user menu (a dropdown) that contains
Settings. "Config" moves into that dropdown. Whether desktop gets entry points
for the + actions is open (section 15).

### 11.2 Mobile tab bar

Five slots, icons only, no written labels:

| Slot | Icon (iOS SF Symbols) | Destination |
|---|---|---|
| 1 | `square.grid.2x2` | Collection |
| 2 | `text.magnifyingglass` | Labels (section 11.6) |
| 3, center, raised | `plus.circle.fill` | The + sheet (section 11.3) |
| 4 | `chart.bar.fill` | Numbers (a translation of the desktop screen) |
| 5 | `person.circle.fill` | Account (section 11.7) |

- Every icon has an accessible name. Icon-only does not remove that requirement.
- Targets are at least 44 pt on iOS and 48 dp on Android.
- The center button is raised to draw attention, because most activity starts
  there. It is a custom control, so it carries its own accessibility,
  safe-area and system-back handling (Proposed).
- Whether icons switch between outline and filled for the selected state is
  open and depends on the final design of the bar.
- To the author's understanding, SF Symbols are licensed for Apple platforms
  only; the owner should confirm against Apple's current license. iOS uses them.
  The Android icon set is chosen when the Android app starts (Decided), and the
  web icon set is open.
- Groups has no tab on mobile (Decided): it lives under Account.

### 11.3 The + sheet

Pressing + offers three choices: **Add a bottle**, **Log a tasting**, and
**What to drink tonight**.

### 11.4 Add a bottle and Log a tasting

Both begin with a search box and a barcode scan button (`barcode.viewfinder`).

- **Add a bottle:** search the user's labels, or scan. An unknown barcode starts
  a new label with the code saved on it.
- **Log a tasting:** search the user's labels and bottles, or scan. A tasting
  always belongs to a label and optionally to a specific bottle the user owns,
  so a pour of an unowned bottle (at a bar, at a friend's) can be logged
  (Proposed data model, following from the Labels decision).
- Lookup is local for now: the user's own labels only (Decided). A central
  catalog comes later (section 14.5).
- A tasting entry is quick, in the style of Untappd. The user picks from default
  tasting-note tags for that kind of spirit (a fixed vocabulary per category).
  Free text and a longer description are optional and stay with the user
  (Decided). Whether there is a rating is open.

### 11.5 What to drink tonight

A mobile-first flow: **Spirit**, then **proof point**, then **flavors**. Each
step offers multi-choice boxes. At the bottom is **Spin the bottle**, a fully
random choice.

- The flavors step appears once the user has at least 25 tastings, and is
  gated per spirit (Decided): if the chosen spirit has too few tastings of its
  own, flavors are skipped and the screen asks **"Time to open a new bottle?"**
  for that spirit. The per-spirit minimum is set in the Tonight spec. Once the
  central catalog can supply flavor profiles, this rule will change.
- The proof step is skipped for spirits where proof does not discriminate
  (Proposed).
- Whether Spin picks only from open bottles or from everything is open. The
  server already has a roulette route (`src/app/api/bottles/roulette`); check
  whether to reuse it.

### 11.6 Labels (mobile)

A searchable history of the user's tastings, like Untappd's check-in history
(Decided). Until a central catalog exists it holds only what the user has
entered or tasted. Two things are open: the tab's name, since it holds tastings
but is called Labels, and what Labels means on desktop, where it is currently
the reference library (section 15).

### 11.7 Account

A profile picture (initials until one is set, Proposed), the user's name, then
a list: **Account**, **Preferences** (for the app), **Groups**, **Config**
(Decided). The profile picture is polish only. Social features are far in the
future and are not committed.

- Config is administrative, so it is shown to admins only (Proposed).
- Where the native app's server connection setting lives (Account or Config)
  is open.
- In standalone mode there is no server account: Account shows a local profile
  and Config is hidden (Proposed).

### 11.8 Collection on mobile

A gallery of the user's bottles. In-depth mode is a floating `tablecells`
button at the bottom right (Decided). It is small, sits above the tab bar, and
the gallery has enough bottom padding that no bottle hides under it (Proposed).
It is a view toggle, so it does not carry the primary-action weight that the
floating button has on Android.

## 12. Voice

- Personality lives in serif headlines and short quips written from the user's
  own data, for example "Kentucky leads, 17 to everybody else."
- It is not decorative and never appears as marker.
- Detailed voice rules (profanity, personality levels, copy for forms and
  errors) are not decided here. `DESIGN.md` section 12 and its personality
  settings are superseded, and a voice guide is a follow-up.

## 13. Accessibility

- WCAG 2.2 AA is the minimum (existing project requirement).
- Color is never the only indicator; the category name is always present.
- Text on color meets 4.5:1 (section 6.3). Frames meet non-text contrast through
  the hairline outline (section 6.4).
- Respect system text size (Dynamic Type and Android font scale). Marks scale
  with a cap.
- Respect reduced-motion and contrast preferences.
- Touch targets of at least 44 pt (iOS) and 48 dp (Android).
- Every mark and icon has a text equivalent.

## 14. Consequences outside this spec

### 14.1 Product document

`PRODUCT.md` must be rewritten. Items that conflict with this spec:
"Platform: web"; the non-goal "no native mobile apps"; the tagline "A field
guide to your liquor collection" and its Rick commitment; and the single-audience
assumption (self-hosted collectors only). The rewrite also states the
privacy-promise change for hosted users, the product sequence (section 1), the
planned central catalog, and that social features are a far-future possibility
and not a commitment.

### 14.2 Design documents

`DESIGN.md` and `docs/DESIGN-TOKENS.md` are superseded by this spec and by the
tokens written from it. Note that the app already ships Aileron, not the
Helvetica Now named in `DESIGN.md`.

### 14.3 Native architecture (a separate spec)

Native clients are blocked on things this spec does not solve:
- A public, authenticated API. On `main`, only a few routes exist and mutations
  are server actions. A bearer-token JSON API and a SwiftUI client are under
  way on the unmerged `claude/ios-app` branch (an online-only client with no
  local database).
- A storage-agnostic client from the first version (on the device, on a
  self-hosted server, or on a hosted account), so neither standalone mode nor
  the optional hosted service forces a rebuild.
- A compatibility policy for app and server versions, since self-hosters update
  on their own schedule.
- Native sign-in (passkeys, SSO, two-step) and offline behavior for use in
  stores with poor signal.
- Selling a hosted plan inside the iOS app falls under Apple's in-app purchase
  rules, which must be checked before any paywall is designed.
- **Label identity** (Proposed), so today's user-entered labels can be linked to
  a central catalog later without guesswork. Give every label a globally unique
  ID when it is created, a nullable "catalog link" field that stays empty for
  now, and an optional stored barcode (the one exact matching key). Matching
  links records and never overwrites what the user entered. Check what IDs
  labels use today.

### 14.4 Features pulled forward

Logging a tasting (milestone M9) is stage two of the product sequence and is
central to the mobile app (section 11). The first version: a label (and
optionally a bottle), tags from a fixed vocabulary per category, optional free
text, an optional photo, and no rating until decided. It needs its own spec and
a data model. The per-category tag vocabularies must be written.

### 14.5 Data leaving the user's server

A central catalog is stage three. Nothing here is built now. The only
requirement on current work is that tastings use a fixed flavor vocabulary
from the start.

**Lookup (Decided).** A catalog lookup uses a label or a barcode only. Security
is a top priority. Proposed ways to hold that line:
- A request carries one barcode or one search term, and nothing else: no
  collection, no user identity, no device identifier, no token from the user's
  server.
- Responses are public catalog data only.
- Search is sent on submit, never on each keystroke.
- It is opt-in for self-hosters, and works fully locally when off.
- Barcode results are cached on the device.
- The call goes through the user's own server, so the catalog sees the server
  and not the phone.

**Contribution (Decided).** Flavor tags from tastings are shared with the
central database to improve flavor recommendations for everyone. The user's
free text and longer descriptions stay with the user. Proposed protections:
- Opt-in and off by default for self-hosters, with a clear screen showing
  exactly what is sent.
- Only the label (or barcode) and tags from the fixed vocabulary leave the
  server: no free text, no photos, no user ID, no precise timestamp.
- Sending is batched and delayed so a contribution cannot be tied to the moment
  it was logged.
- The catalog shows a flavor for a label only after enough different people
  have contributed it.

**An open tension for the catalog spec.** Fully anonymous contributions cannot
be deleted later and cannot be rate-limited against spam or deliberate tag
stuffing. Tying contributions to accounts allows both, but is not anonymous. A
common compromise is accounts for rate limiting and removal, with stored
contributions carrying only an anonymous token.

### 14.6 Run modes, export and first connection (Decided)

- **Three modes:** standalone (data on the device), with the user's own home
  server (strongly recommended; the server holds the truth and devices keep a
  working copy and sync), and hosted (later, optional).
- **Standalone is full core:** bottles, photos, labels and tastings. The server
  adds the web and desktop app, sync across devices, household accounts, Config
  and backups.
- **On-device database.** SQLite is allowed on the device. The server database
  stays Postgres, so the old "no SQLite" non-goal is reworded to cover the
  server only. The data is relational, so a SQL store is the natural fit, and
  one schema could serve iOS and Android. The choice is open (SwiftData and GRDB
  are the iOS candidates; both use SQLite underneath).
- **Manual export.** A human-readable CSV of bottles that Rickhouse can import.
  It excludes tastings and has no standalone label records. The export screen
  says so at the moment of export. Standalone tastings therefore cannot be
  backed up except by connecting to a server (Decided limitation).
- **First connection to a server.** Strict silent matching first: the same
  barcode, or the same brand, name, proof and age statement with the same
  purchase date and price paid. Everything else goes to a duplicate review. After
  records are linked, the most recent edit wins per record. Device clocks are
  trusted. Tastings are copied to the server.

## 15. Open decisions

Each has an owner (the product owner) and a trigger.

| Decision | Trigger |
|---|---|
| Marker typeface and the look of the tape | Before the marks component is built |
| Per-spirit minimum number of tastings for the flavors step | Tonight spec |
| Spin: open bottles only, or everything | Tonight spec |
| Tab name for the tasting history, and what Labels is on desktop | Before the mobile tab bar is built |
| Outline vs filled tab icons | When the tab bar is designed |
| Web and Android icon sets | Before those platforms are built |
| Per-category tasting-note vocabularies | Before the tasting log is built |
| Where the native server-connection setting lives | Native architecture spec |
| Desktop entry points for add, log a tasting and tonight | Web redesign spec |
| Mobile in-depth mode details (button size, scroll behavior) | Collection screen spec |
| Dark-mode palette | Before dark mode is built; needs the light palette final |
| New tagline | During the PRODUCT.md rewrite |
| Does the desktop have a gallery view | Web redesign spec |
| Desktop navigation set | Web redesign spec |
| Tasting ratings: yes or no | Tasting log spec |
| Voice guide (profanity, personality levels) | Before copy is written at scale |
| Brandy and Other default card facts | Before the card ships |
| A yearly recap moment | Optional; can be dropped |
| Frame thickness | Test with real photos at card scale |
| Grid column counts beyond 2 and 3 | Collection screen spec |
| On-device database and the Android stack | Native architecture spec |
| Duplicate review screen on first connection | Native app spec |

## 16. Follow-up specs

1. PRODUCT.md rewrite.
2. Native architecture (API, auth, sync, offline, version compatibility).
3. Tonight flow screen.
4. Web redesign implementing this language.
5. Tasting log.
6. Central catalog and contribution (stage three), including the anonymity
   versus anti-abuse decision.
7. Dark-mode palette.
8. Native app build.
