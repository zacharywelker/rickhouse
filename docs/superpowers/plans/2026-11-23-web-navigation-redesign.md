# Web navigation redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight-link header with a top bar of the main places, a nav search, a hideable Groups rail on Collection, and one sectioned account menu.

**Architecture:** Pure modules hold every rule that can be tested without a browser (nav items, menu sections, rail visibility, group links, search grouping, shortcuts). Thin client components render them. Search reuses the existing pure `searchLabels` matcher and `loadLabelDocs`, behind one server action.

**Tech Stack:** Next.js App Router, React client components, Tailwind, Drizzle, Vitest (`npm test`), Playwright (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-23-web-navigation-redesign-design.md`

## Global Constraints

- Main places, in order: **Collection** (`/bottles`), **Journal** (`/journal`, a "Coming soon" page for now), **Flights** (`/tournaments`, URLs unchanged), **Numbers** (`/numbers`).
- Top bar at 864px shows every place and no menu button. Narrow (under **720px**): logo, search button, Menu button; tap targets 44px tall.
- Nav style stays typographic: uppercase links, current page marked by a 2px rule, no icons except the search magnifier, square corners.
- Menu sections, in order: **Library** (Labels `/expressions`, Housekeeping `/housekeeping`, Configuration `/admin`), **You** (Account settings `/account`, Appearance System/Light/Dark, Sign out), **Admin** (admins only: "Users & sign-in" `/system/users`, Backups `/system/backups`).
- Search groups, in order, top **3** each, empty groups hidden: Your bottles, Labels, Brands, Distilleries, Groups. No Tastings group, no "Log tasting" action.
- Shortcuts: `⌘K`/`Ctrl+K` opens search everywhere. `/` focuses the `grid-search` filter box where one exists, else opens search. Neither fires from a text field, except `⌘K`.
- Label and bottle page URLs (`/expressions/[id]`, `/bottles/[id]`) do not change.
- The bulk editor (route group `(wide)`) keeps full width and shows no Groups rail.
- Every admin page and action keeps calling `requireAdmin()`.
- Verification of DB-backed and Playwright specs happens on a throwaway database only (`e2e/support/db.ts` refuses anything else). CI skips them, so the PR states the counts run.

## Review Focus

Failure modes the spec implies that no single task's happy path covers, most likely first:

1. Empty, one-character or punctuation-only query: no groups and no request. `searchLabels` returns the newest labels for an empty query; the nav search must not. (Task 7, 8)
2. A slow earlier search response arriving after a later one must not overwrite it. (Task 8)
3. `Blanton's`, `blantons` and `BLANTON’S` find the same label. (Task 7)
4. `?group=<id>` of another account, or a deleted group, shows an empty Collection, never someone else's bottles or an error. (Task 5)
5. A non-admin visiting `/system/users`, `/system/sso` or `/system/email` is refused, including through the redirects. (Task 4)

---

### Task 1: Top bar, Home removed, Flights renamed

**Files:**
- Create: `src/components/nav/nav-items.ts`, `src/components/nav/__tests__/nav-items.test.ts`, `src/app/(app)/journal/page.tsx`
- Modify: `src/components/app-nav.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/tournaments/page.tsx` (h1 and `metadata.title`), `e2e/support/auth.ts` (line 32), `e2e/auth.spec.ts`

**Interfaces:**
- Produces: `PLACES: readonly { href: Route; label: string }[]` (Collection, Journal, Flights, Numbers); `isCurrent(pathname: string, href: string): boolean` (exact or subtree match; no Home special case); `NARROW_QUERY = "(max-width: 719px)"`.

- [ ] **Step 1: Write the failing test** `nav-items.test.ts`: `PLACES` labels equal `["Collection","Journal","Flights","Numbers"]`; `isCurrent("/journal","/journal")` is true; `isCurrent("/bottles/12","/bottles")` is true; `isCurrent("/bottlesx","/bottles")` is false; `isCurrent("/expressions","/bottles")` is false.
- [ ] **Step 2: Run** `npx vitest run src/components/nav` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `nav-items.ts`. In `app-nav.tsx` drop the `LINKS` array, `xl:` breakpoints, and the Home/Housekeeping/Configuration/Labels/Groups links; render `PLACES` inline from 720px up (use `min-[720px]:`), and keep a Menu button below it with the existing disclosure behaviour (Escape closes, navigating closes, closes on resize past 720). The logo links to `/bottles`. Keep the `wide` prop. Add an optional `accountPanel?: React.ReactNode` prop (unused until Task 2). **Ruling:** until Task 2, keep the existing `signOut` prop, the sign-out icon and the bar's `ThemeToggle` exactly as they are, so nothing disappears between tasks; Task 2 removes them and drops the `signOut` prop.
- [ ] **Step 4: Replace** `src/app/(app)/page.tsx` with a server component that calls `redirect("/bottles")` (delete the Home queries and stat code with it; remove any now-unused imports repo-wide with `npm run lint`).
- [ ] **Step 4a: Fix the sign-in landing in e2e.** Signing in lands on `/`, which now redirects to `/bottles`. Update `e2e/support/auth.ts:32` and each *post-sign-in* `toHaveURL("/")` in `e2e/auth.spec.ts` (around lines 46, 57, 70, 95, 134, 176, 183, 255) to expect `/bottles`. Read each one: `page.goto("/")` calls stay, and an assertion that checks being sent to the login page is not touched.
- [ ] **Step 4b: Create** `src/app/(app)/journal/page.tsx`: a server component with `metadata.title` "Journal", an `<h1>` "Journal" and one line "Coming soon." in the app's existing page-header style (see `account/page.tsx`). It is a page, not a redirect.
- [ ] **Step 5: Rename** the tournaments page `<h1>` and `metadata.title` to "Flights". Leave in-body wording and URLs alone.
- [ ] **Step 6: Run** `npx vitest run src/components/nav`, `npm run typecheck`, `npm run lint` — all pass.
- [ ] **Step 7: Commit** `feat(nav): top bar with Collection, Flights, Numbers; remove Home`.

### Task 2: Account menu in sections

**Files:**
- Create: `src/components/nav/account-menu-sections.ts`, `src/components/nav/account-sections.tsx`, `src/components/nav/__tests__/account-menu-sections.test.ts`
- Modify: `src/components/user-menu.tsx`, `src/components/app-shell.tsx`, `src/components/app-nav.tsx`

**Interfaces:**
- Produces: `type MenuItem = { href: Route; label: string }`; `type MenuSection = { title: "Library" | "You" | "Admin"; items: MenuItem[] }`; `menuSections(isAdmin: boolean): MenuSection[]` (Library, You, then Admin only when `isAdmin`; the You section's `items` holds only Account settings, since Appearance and Sign out are rendered by the component); `AccountSections({ sections, signOut }: { sections: MenuSection[]; signOut: React.ReactNode })`.
- Consumes: `ThemeToggle` (`src/components/theme-toggle.tsx`), the sign-out form currently built in `app-shell.tsx`.

- [ ] **Step 1: Write the failing test**: `menuSections(false)` titles are `["Library","You"]`; `menuSections(true)` adds `"Admin"` with exactly "Users & sign-in" → `/system/users` and "Backups" → `/system/backups`; Library items are Labels, Housekeeping, Configuration in that order.
- [ ] **Step 2: Run** `npx vitest run src/components/nav` — expect FAIL.
- [ ] **Step 3: Implement** `menuSections`, then `AccountSections` (section headings in the existing uppercase small style; Appearance row renders `ThemeToggle`; Sign out is the last row of You and renders `signOut`).
- [ ] **Step 4: Rewrite** `UserMenu` to take `{ name, username, content: React.ReactNode }` and show `content` inside the existing popover, keeping "Signed in as" and `firstName`. In `AppShell` build `signOut` as now, build `const sections = <AccountSections sections={menuSections(user.role === "admin")} signOut={signOut} />`, and pass it to both `UserMenu content` and `AppNav accountPanel`. Remove the standalone sign-out icon and the bar's `ThemeToggle`. `AppNav` renders `accountPanel` under the four places in the narrow panel; the desktop `userMenu` is hidden below 720px.
- [ ] **Step 2b: Run** tests, typecheck and lint; all pass.
- [ ] **Step 5: Commit** `feat(nav): one sectioned account menu with sign out and appearance`.

### Task 3: Currency moves to Account settings

**Files:**
- Modify: `src/app/(app)/account/page.tsx`, `src/app/(app)/admin/page.tsx`

**Consumes:** `CurrencySelect` (`src/components/preferences/currency-select.tsx`), `getPreferences(user.id)` (`src/lib/preferences`).

- [ ] **Step 1: Add** a "Display" `Section` containing `<CurrencySelect value={preferences.currency} />` to the account page (read preferences with `getPreferences(user.id)`).
- [ ] **Step 2: Remove** the "Display" section and the unused `CurrencySelect` import from `admin/page.tsx`. Leave the "Trying out" section where it is.
- [ ] **Step 3: Add e2e** in `e2e/admin.spec.ts` (or the account spec, whichever already signs in as the admin): changing currency on `/account` persists after reload, and `/admin` no longer shows a Currency control.
- [ ] **Step 4: Run** that spec on the throwaway DB — pass.
- [ ] **Step 5: Commit** `feat(account): currency preference lives in Account settings`.

### Task 4: Users & sign-in page

**Files:**
- Create: `src/components/system/email-settings.tsx` (`EmailSettingsSection`), `src/components/system/sso-settings.tsx` (`SsoSettingsSection`)
- Modify: `src/app/(app)/system/users/page.tsx`, `src/app/(app)/system/email/page.tsx`, `src/app/(app)/system/sso/page.tsx`, `e2e/admin.spec.ts`

**Interfaces:**
- Produces: `EmailSettingsSection()` and `SsoSettingsSection()`, async server components holding what each page renders today under its `<h1>`. `smtp-form.tsx`, `provider-form.tsx` and the `actions.ts` files stay where they are.

- [ ] **Step 1: Move** each page body (everything except the `<h1>` and metadata) into its section component.
- [ ] **Step 2: `users/page.tsx`** becomes the "Users & sign-in" page: `<h1>Users & sign-in</h1>`, `metadata.title` the same, then the existing Users content, then `<section id="sso">` and `<section id="email">` rendering the two section components, each with its own heading.
- [ ] **Step 3: `sso/page.tsx` and `email/page.tsx`** become `redirect("/system/users#sso")` and `redirect("/system/users#email")`. The `system/layout.tsx` `requireAdmin()` guard already runs first; do not move it.
- [ ] **Step 4: Update** `e2e/admin.spec.ts` for the merged page and add: visiting `/system/sso` as a signed-in non-admin is refused (same outcome as `/system/users`), and as admin lands on `/system/users`.
- [ ] **Step 5: Run** the admin spec on the throwaway DB — pass.
- [ ] **Step 6: Commit** `feat(admin): combine Users, SSO and Email into one page`.

### Task 5: Group filter on the Collection

**Files:**
- Modify: `src/lib/bottles/filters.ts`, `src/lib/bottles/grid.ts` (where `brandIds` is turned into SQL), `src/lib/bottles/__tests__/filters.test.ts`
- Test: add one e2e case in `e2e/grid.spec.ts`

**Interfaces:**
- Produces: `BottleFilters.groupId: number | null` (default `null`); URL param `group`; `parseFilters` accepts only a positive integer, else `null`; `serialiseFilters` writes it; `activeFilterCount` counts it.

- [ ] **Step 1: Write failing tests** in `filters.test.ts`: `group=7` round-trips; `group=abc`, `group=-1`, `group=0` parse to `null`; `DEFAULT_FILTERS.groupId` is `null`; `activeFilterCount` is 1 with only `groupId` set.
- [ ] **Step 2: Run** `npx vitest run src/lib/bottles/__tests__/filters.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the field in the type, defaults, parse, serialise and count.
- [ ] **Step 4: Apply** it in `grid.ts`: when `groupId !== null`, restrict to bottle ids in `groupBottles` for that group **and** require the group to belong to `ownerId` (so a foreign or deleted id matches nothing). Smart groups need no code here: their stored `filterQuery` is already a Collection query.
- [ ] **Step 5: e2e** in `grid.spec.ts`: a hand-picked group's id in `?group=` shows only its bottles; an id belonging to another account shows the empty state.
- [ ] **Step 6: Run** unit tests, then the e2e on the throwaway DB — pass.
- [ ] **Step 7: Commit** `feat(collection): filter by hand-picked group`.

### Task 6: Groups rail on Collection

**Files:**
- Create: `src/lib/groups/rail.ts`, `src/lib/groups/__tests__/rail.test.ts`, `src/components/bottles/groups-rail.tsx`
- Modify: `src/app/(app)/bottles/page.tsx`

**Interfaces:**
- Produces: `type RailGroup = { id: number; name: string; filterQuery: string | null }`; `groupHref(group: RailGroup): string` (smart: `/bottles?` + its `filterQuery`; hand-picked: `/bottles?group=<id>`); `currentGroup(filters: BottleFilters, groups: RailGroup[]): RailGroup | null` (hand-picked by `groupId`; smart by `smartGroupQuery(filters) === filterQuery`); `RAIL_MIN_WIDTH = 1100`; `railInitiallyOpen(viewportWidth: number, stored: string | null): boolean` (a stored `"open"` or `"closed"` wins; any other value falls back to `viewportWidth >= RAIL_MIN_WIDTH`).
- Consumes: `smartGroupQuery` (`src/lib/groups/smart.ts`).

- [ ] **Step 1: Write failing tests** for the four functions above, including: stored `"nonsense"` at width 900 → `false`; stored `"open"` at 900 → `true`; a smart group's own query is recognised as current; two groups never both current.
- [ ] **Step 2: Run** `npx vitest run src/lib/groups/__tests__/rail.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the module, then `GroupsRail` (client): left column of "All bottles" plus groups, a hide control, a "Manage groups" link to `/groups`; when hidden, a "Groups: <current or All> ›" button above the table brings it back. State persists in `localStorage` key `rickhouse.groupsRail` (wrapped in try/catch); initial render is closed until mounted to avoid a hydration mismatch. Below 720px the button opens the list as a dropdown instead of a side rail.
- [ ] **Step 4: Load** the user's groups in `bottles/page.tsx` (`id, name, filterQuery`, ordered by name) and wrap the table area so the rail sits beside it. Do not touch the `(wide)` bulk editor routes.
- [ ] **Step 5: Run** unit tests, typecheck, lint — pass.
- [ ] **Step 6: Commit** `feat(collection): hideable Groups rail`.

### Task 7a: Search core (pure)

**Files:**
- Create: `src/lib/nav-search/search.ts`, `src/lib/nav-search/__tests__/search.test.ts`

**Interfaces:**
- Consumes: `searchLabels`, `words`, `LabelDoc` (`src/lib/expressions/label-search.ts`); `loadLabelDocs(ownerId)` (`label-search-docs.ts`); `groupHref`, `RailGroup` (Task 6).
- Produces (`search.ts`): `PER_GROUP = 3`; `type OwnedBottle = { id: number; expressionId: number; brand: string; name: string; category: string; proof: string | null; isOpen: boolean; fillPct: number }`; `type BrandRef = { id: number; name: string; labels: number; bottles: number }`; `type DistilleryRef = BrandRef & { place: string | null }`; `type NavSearchData = { labels: LabelDoc[]; ownedBottles: OwnedBottle[]; brands: BrandRef[]; distilleries: DistilleryRef[]; groups: RailGroup[] }`; `type NavRow = { key: string; title: string; detail: string; href: string }`; `type NavSearchResult = { bottles: NavRow[]; labels: NavRow[]; brands: NavRow[]; distilleries: NavRow[]; groups: NavRow[]; newLabelHref: string | null }`; `navSearch(data: NavSearchData, query: string): NavSearchResult`; `newLabelHref(query: string): string` (`/expressions/new?name=` + `encodeURIComponent` of the trimmed query).
Rules `navSearch` enforces: a label with an owned bottle appears under bottles (via its bottle row, href `/bottles/<id>`) and not under labels (href `/expressions/<id>`); brand href `/bottles?brand=<id>`; distillery href `/bottles?distillery=<id>`; brand, distillery and group names match when every typed word is contained in the name's `words()` text; at most `PER_GROUP` rows per group; an empty or no-word query returns all-empty groups and `newLabelHref: null`; otherwise `newLabelHref` is always set.

- [ ] **Step 1: Write failing tests** with a fixture of Elijah Craig Barrel Proof (owned), Elijah Craig Small Batch (no bottle), Buffalo Trace (brand and distillery) and two groups. Assert: query `"elijah"` → bottles has Barrel Proof only, labels has Small Batch only, neither in both; `""`, `"   "` and `"!!"` → every group empty, `newLabelHref` null; `"Blanton's"`, `"blantons"` and `"BLANTON’S"` return the same label; a typed UPC of a fixture label returns it as the first row; five matching labels → three rows; `newLabelHref("elijah craig")` is `/expressions/new?name=elijah%20craig`; a 500-character query does not throw.
- [ ] **Step 2: Run** `npx vitest run src/lib/nav-search` — expect FAIL.
- [ ] **Step 3: Implement** `navSearch` over `searchLabels(data.labels, query, { limit: Number.POSITIVE_INFINITY })`, guarding the empty case before calling it.
- [ ] **Step 4: Run** unit tests, typecheck, lint — pass.
- [ ] **Step 5: Commit** `feat(search): nav search core`.

### Task 7b: Search loader

**Files:**
- Create: `src/lib/nav-search/load.ts`, `src/lib/nav-search/__tests__/load.integration.test.ts`

**Interfaces:**
- Consumes: `NavSearchData` (Task 7a), `loadLabelDocs` (`src/lib/expressions/label-search-docs.ts`).
- Produces: `loadNavSearchData(ownerId: number): Promise<NavSearchData>` — labels from `loadLabelDocs`; owned bottles from `bottleList` where `isOwnedNow` (`src/lib/bottles/grid.ts`); brand and distillery rows with label counts and owned-bottle counts; the owner's groups (`id`, `name`, `filterQuery`). Add a `// ponytail:` comment that it loads everything per query, fine at a few thousand labels, cache if it measures slow.

- [ ] **Step 1: Write the integration test** following the opt-in pattern of `src/lib/bottles/__tests__/add-open.integration.test.ts`: seed one owned bottle, one label with no bottle, one brand, one distillery and one group for owner A, plus a label and a group for owner B; assert A's result has exactly A's rows (counts included) and none of B's.
- [ ] **Step 2: Run** it on the throwaway DB — expect FAIL (module missing).
- [ ] **Step 3: Implement** `loadNavSearchData`.
- [ ] **Step 4: Run** the integration test on the throwaway DB, plus typecheck and lint — pass.
- [ ] **Step 5: Commit** `feat(search): nav search loader`.

### Task 8: Search UI, shortcuts, narrow takeover

**Files:**
- Create: `src/lib/nav-search/shortcuts.ts`, `src/lib/nav-search/__tests__/shortcuts.test.ts`, `src/components/nav/search-actions.ts`, `src/components/nav/nav-search.tsx`
- Modify: `src/components/keyboard-shortcuts.tsx`, `src/components/app-nav.tsx`

**Interfaces:**
- Produces: `shortcutFor(input: { key: string; meta: boolean; ctrl: boolean; alt: boolean; typing: boolean; hasFilterBox: boolean }): "open-search" | "focus-filter" | "new-bottle" | null`; `navSearchAction(query: string): Promise<NavSearchResult>` (`"use server"`; `requireSession()`, query trimmed and cut to 100 characters, then `navSearch(await loadNavSearchData(user.id), query)`); `OPEN_SEARCH_EVENT = "rickhouse:open-search"`; `NavSearch({ variant }: { variant: "inline" | "takeover" })`.
- Consumes: `navSearch`, `NavSearchResult` (Task 7).

- [ ] **Step 1: Write failing tests** for `shortcutFor`: `k` with meta → `open-search` even when `typing`; `k` with ctrl likewise; `/` typing → `null`; `/` with `hasFilterBox` → `focus-filter`; `/` without → `open-search`; `n` not typing → `new-bottle`; `n` with meta → `null`; any key with alt → `null`.
- [ ] **Step 2: Run** `npx vitest run src/lib/nav-search/__tests__/shortcuts.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `shortcutFor`, and rewrite the `onKey` handler in `keyboard-shortcuts.tsx` to call it (focus `SEARCH_INPUT_ID` for `focus-filter`; dispatch `OPEN_SEARCH_EVENT` for `open-search`; `router.push("/bottles/new")` for `new-bottle`). It no longer pushes `/bottles` for `/`.
- [ ] **Step 4: Implement** `NavSearch` as an ARIA combobox: input `role="combobox"` with `aria-expanded`/`aria-controls`/`aria-activedescendant`; results in a `role="listbox"` with group headings; up/down moves, Enter opens the active row, Escape closes. Debounce 150 ms; send nothing for queries with no letters or digits; keep a request counter and ignore any response that is not the latest. Last row is "Not here? Add “<query>” as a new label" linking `newLabelHref`. Rows for brands and distilleries show the count and an "Show in Collection" action. `inline` renders a compact 150px field that widens when focused; `takeover` fills the bar with a Cancel button.
- [ ] **Step 5: Wire** into `AppNav`: inline from 720px up; below it a magnifier button swaps the bar for `NavSearch variant="takeover"`. Listen for `OPEN_SEARCH_EVENT` to focus or open it.
- [ ] **Step 6: Run** unit tests, typecheck, lint — pass.
- [ ] **Step 7: Commit** `feat(search): nav search, shortcuts and narrow takeover`.

### Task 9: End-to-end coverage, old specs, DESIGN.md

**Files:**
- Create: `e2e/navigation.spec.ts`
- Modify: `e2e/polish.spec.ts` (~line 117), `e2e/tournaments.spec.ts` (~lines 245-259), `e2e/admin.spec.ts` (~line 16), `DESIGN.md` §7 (the root file; there is no `docs/DESIGN.md`, though some code comments still cite that path)

- [ ] **Step 1: Update** the three existing specs: "Open menu" stays the narrow Menu button's accessible name, now below 720px; the tournaments spec becomes "the Flights link is in the bar at 864px and in the menu below 720px" and asserts the page heading "Flights"; the admin spec reaches Configuration through the account menu's Library section.
- [ ] **Step 2: Write** `navigation.spec.ts`: at 864px Collection, Journal, Flights and Numbers are visible and no Menu button exists; clicking Journal lands on `/journal` showing "Coming soon" with Journal marked current; `/` redirects to `/bottles`; `⌘K` opens search, typing a seeded brand shows Brands with a count, Enter on a bottle row opens `/bottles/<id>`; the footer link reaches `/expressions/new?name=…`; the Groups rail starts hidden at 864px, "Groups: All ›" shows it, and the choice survives a reload; the bulk editor at 864px has no rail and no Groups button; the account menu lists Library, You and Sign out, and Admin only for the admin; below 720px the magnifier opens the takeover and Cancel closes it.
- [ ] **Step 3: Update** `DESIGN.md` §7 to the shipped navigation (places, search, rail, menu, narrow bar), noting Journal is a "Coming soon" placeholder until its page is designed.
- [ ] **Step 4: Run** the full unit suite (`npm test`), `npm run typecheck`, `npm run lint`, then `npx playwright test e2e/navigation.spec.ts e2e/polish.spec.ts e2e/tournaments.spec.ts e2e/admin.spec.ts e2e/grid.spec.ts --trace off` on the throwaway DB; record the counts for the PR.
- [ ] **Step 5: Commit** `test(nav): e2e coverage; update DESIGN.md navigation`.
