# Web navigation redesign

Design for how people move around the Rickhouse web app: the top bar, the search, the Groups rail and the account menu. Decided in conversation with the collection owner on 2026-11-23. Mockups: `.superpowers/brainstorm/` (local, not committed).

## Why

Two problems with the header today (`src/components/app-nav.tsx`):

1. **Too many, unclear options.** The bar carries eight links: Home, Collection, Labels, Tournaments, Groups, Numbers, Housekeeping, Configuration. Several are maintenance pages used rarely. `DESIGN.md` §7 lists five desktop links and puts Config in the user menu; the code has drifted from it.
2. **The menu button appears at half-screen.** The full row needs about 1050px, so under `xl` (1280px) it collapses behind a menu button. Half of a 16" MacBook Pro is about 864px, so the owner has to open the menu on every navigation.

The people who use this: the owner of a home collection, on a laptop beside the shelf, and on a phone in a shop.

## What it should do

- Show the main places at all times at 864px wide, with no menu to open.
- Get to any label or bottle page quickly, by typing. Three cases the owner named:
  - in a shop, looking up a label they are considering buying (it may be a label they have entered but do not own);
  - at a table, pulling up a label, a logged tasting, or the components of a blend;
  - holding a bottle from the shelf and looking it up.
- Keep the bulk editor's full width.

## Goals, non-goals, anti-goals

**Goals**
- Four main places: **Collection, Journal, Flights, Numbers**.
- A search in the bar that reaches labels, owned bottles, brands, distilleries, groups and tastings.
- Groups becomes a choice within Collection.
- An account menu that holds everything else.

**Non-goals** (separate work)
- The label and bottle detail pages. They are being redesigned separately; this document only covers how people reach them.
- The add-label and add-bottle flow (another conversation).
- The content and design of the Journal page. This document only places it in the navigation.
- iOS navigation and tab names. The phone app keeps its own tabs (`DESIGN.md` §7 mobile).
- A shared catalog of labels the user has not entered, or lookups against outside data such as TTB. Search covers the user's own data only, as the lookup rule in `DESIGN.md` §8 already says. Nothing here should rule a catalog out later.

**Anti-goals**
- Anything that makes the bulk editor narrower.
- Search that buries the owner's own bottle under a long list of brands and distilleries.
- A second search that competes with the Collection page's own filter box.

## Constraints

- `DESIGN.md` §7 calls the nav typographic and restrained: uppercase links, the current page marked by a rule under it, no icons, no pills. `app-nav.tsx` cites §14.1 for the same. The search uses a magnifier, which the Collection filter bar already uses (`filter-bar.tsx`).
- Shipped tokens in `src/app/globals.css`: ivory ground, ink text, `--radius-md/lg/xl` flattened to 0, restrained shadows. Mockups followed these.
- Light and dark are equals; the OS preference is the default.
- The bulk editor lives in the `(wide)` route group; `AppShell` passes `wide` to the nav (`src/components/app-shell.tsx`).

## Approaches considered

**Container.** (A) A top bar with four links, compact search and the account menu. (B) A left sidebar with labelled links, Groups nested under Collection, search on top. (C) A top bar like A, plus a Groups rail on the Collection page only.
*Chosen: C, with the rail hideable and absent from the bulk editor.* A sidebar costs about 184px of the width the bulk editor is already short of, and with only four places there is little for it to hold except Groups. The owner liked the top bar and was happy with a hideable rail.

**Search results.** (A) Grouped by type under headings. (B) One ranked list with type tags.
*Chosen: grouped.* Easier to scan when the results mix types.

**Account menu.** (A) One menu in sections. (B) A separate "Library" menu plus the name menu.
*Chosen: one menu.* B costs about another 70px of the bar at 864px.

**Browsing the Collection.** Keep pages, or endless scroll. *Kept pages (my call, not objected to).* Collection has bulk selection and a footer; endless scroll loses position on back, and search now covers the "find it fast" need.

## The design

### Main places

```
RICKHOUSE   COLLECTION   JOURNAL   FLIGHTS   NUMBERS        [Search ⌘K]   Zach ▾
```

- **Collection** is the landing page. The Home page (`src/app/(app)/page.tsx`) is removed; `/` redirects to `/bottles`. The logo links to Collection. `redirect("/")` in `src/app/account/setup/` keeps working through that redirect.
- **Journal** is the new tasting log for the web: a journal of dates and tastings. Its design is separate. The nav item appears when the page exists.
- **Flights** is the new name for Tournaments. Same pages. *(My call: change the label only; keep the `/tournaments` URLs, which are referenced in 9 places, to avoid redirects.)*
- **Numbers** is unchanged.
- Labels, Groups, Housekeeping and Configuration are no longer in the bar.

### Search

- A compact field in the bar. Rule: **the nav search jumps to a thing; the page search filters the list in front of you.** The Collection page keeps its own filter box.
- Shortcuts (`keyboard-shortcuts.tsx` today): `⌘K` opens the nav search on every page. `/` keeps its current behaviour on the Collection page (focuses the `grid-search` filter box). On pages with no filter box, `/` opens the nav search instead of jumping to `/bottles`. Typing in a text field never triggers either (the existing `isTyping` rule).
- Results, grouped, top three per group, empty groups hidden:
  1. **Your bottles** — action: Open (bottle page).
  2. **Labels** — only labels with no currently owned bottle, so the shop case works. A label the user owns a bottle of appears once, under Your bottles, and not here. Action: Open (label page).
  3. **Brands** — "9 labels · 4 bottles"; action: Show in Collection (the Collection filtered to that brand, using the existing brand filter in `use-grid-filters.ts` / `lib/bottles/filters.ts`).
  4. **Distilleries** — same, filtered by distillery.
  5. **Groups** — shown only when a group matches; opens the Collection filtered to that group.
- **Not in the first release:** the Tastings group and a "Log tasting" action on label results. The web has no screen that writes a tasting against a label with no bottle (tasting notes are saved per bottle, `saveTastingNoteAction(bottleId, …)` in `src/components/expressions/tasting-notes.tsx`), and tastings have no page until Journal exists. Both are added when Journal and label-level logging exist.
- Footer: "Not here? Add '<what was typed>' as a new label", opening the add-label page with the typed text as `?name=`. If the add flow does not read that parameter yet, the page opens blank until it does.
- **Dependency on the add flow (separate conversation):** after a new label is created from this footer, and before it is saved, the flow must let the user add a bottle of it. Otherwise the shop case ends with a label and no way to record the purchase.
- Matching reuses the existing pure label matcher `searchLabels` in `src/lib/expressions/label-search.ts`, fed by `loadLabelDocs` (`label-search-docs.ts`). It already handles accents, apostrophes and typed barcode or TTB codes. (Corrected after reading the code; the earlier "#351" pointer was a guess.) Note that `searchLabels` returns the newest labels for an empty query; the nav search must return nothing instead.
- Stores, finishes, mashbills and tags are not searched; they are filters, not destinations.

### Groups rail (Collection page only)

- A narrow left rail listing the user's groups, with "All bottles" first and a "Manage groups" link at the bottom. Selecting a group **stays on the Collection page, filtered to that group's bottles**, with the group in the URL so it can be shared. Groups are of two kinds (`groups` table, `src/db/schema.ts`). A smart group stores a Collection query string (`filterQuery`), so selecting it simply opens `/bottles?<that query>`. A hand-picked group lists bottles in `group_bottles` and has no filter today, so the Collection gains a `group=<id>` filter, limited to the owner's own groups. The Groups pages remain for creating and editing groups.
- Shown by default from about 1100px wide; hidden below that; the choice is remembered once the user changes it. At 864px it starts hidden.
- When hidden, a "Groups: <current> ›" button above the table shows the rail again and names the current group.
- Not shown on the bulk editor, and not on any other page.

### Account menu (the user's name)

```
Signed in as zach
LIBRARY   Labels · Housekeeping · Configuration
YOU       Account settings · Appearance (System / Light / Dark) · Sign out
ADMIN     Users & sign-in · Backups                    (admins only)
```

- Sign out moves from its own icon into the menu, at the bottom of YOU (owner's decision; one more click, but it frees width in the bar).
- The theme toggle moves from the bar (`theme-toggle.tsx`) into the menu. Three choices are kept so the app can still follow the OS.
- **Currency** moves from the Configuration page (`admin/page.tsx`, `CurrencySelect`) to Account settings, and is removed from Configuration. It is already stored per user (`getPreferences(user.id)`, `savePreferencesAction`), so no schema change or migration is needed.
- **Users & sign-in** is one admin page combining Users, SSO and Email (today separate routes under `src/app/(app)/system/`, whose layout only calls `requireAdmin()`). `/system/sso` and `/system/email` redirect to the combined page. e2e specs that visit the old routes are updated. SSO and Email are real pages with forms and actions today (the layout's comment calling them "later" is out of date), so they move over as working sections. Each page and action must keep calling `requireAdmin()`. Backups stays a separate page.
- "Configuration" keeps its name and stays shared reference data (brands, distilleries and so on); the reason is in the comment at the top of `app-nav.tsx`.

### Narrow screens (mockup accepted by the owner)

Under about 720px (my number) the four links do not fit. The bar becomes: logo, search button, Menu button. Tap targets are 44px tall.

- **Menu** opens one panel: the four places, then Library, You (Account settings, Appearance, Sign out) and Admin (admins only), the same sections as the desktop account menu. Today's disclosure behaviour carries over: Escape closes, choosing a link closes, the page behind stays scrollable.
- **Search** is one tap away, because the shop case is the phone case. Tapping the magnifier swaps the bar for a full-width field and a Cancel button, and the results fill the screen in the same groups as desktop. "Add as a new label" sits directly under the results so the keyboard does not hide it.
- **Groups** (my call, not mocked): the rail is hidden at this width; the "Groups: <current> ›" button opens the list as a dropdown under the button.

### Not changed

The bulk editor keeps the same bar, search and `wide` behaviour, minus the rail.

## Left to the builder

- Search endpoint and ranking details.
- The responsive breakpoints, within "four places visible at 864px".
- Keyboard focus order and ARIA for the search results list (a combobox pattern) and for the hide/show rail button.
- Updating `DESIGN.md` §7, which already differs from the code and will differ again.

## Decisions on the way out

Home's three totals (bottles owned, open, spend) and its ten most recent acquisitions are dropped with the Home page (owner's decision). Collection can already sort by date acquired. Check whether Numbers shows the totals and report it, but do not add them anywhere.

The label and bottle page addresses (`/expressions/[id]`, `/bottles/[id]`) stay as they are, so this work and the separate page redesign do not collide.

## Open

- iOS and web names will diverge (web: Journal, Flights; phone: Labels, Tournaments, Numbers, Account). Aligning them is a later decision.
- Tastings in search and "Log tasting" from a label result wait for Journal and label-level logging.

## Calls made while writing (not the owner's words)

- Flights keeps the `/tournaments` URLs (label change only).
- Browsing the Collection stays paged.
- Narrow screens (under about 720px): logo, search icon and one menu button holding the four places and the account sections.
- The Journal nav item appears only once the Journal page exists.
