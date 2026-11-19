# Housekeeping 2: The Photos section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Housekeeping page whose first section lists labels, single and private barrels, and vintages that have no photo, as a paged grid of cards where each photo is added by file, pasted link, pasted image or dropped file, with low-resolution images refused.

**Architecture:** A server-rendered page driven by URL parameters (`tab`, `per`, `page`) with two owner-scoped queries (counts for the three tabs, and one page of the current tab). Each card is the app's existing instant-photo frame plus the existing `LabelPhotoControls`, extended to post to a bottle, to pass a `source=housekeeping` flag, and to accept a file handed in from a paste or drop. The 600 px minimum is an option on the image store that only requests carrying that flag turn on.

**Tech Stack:** Next 16 App Router, React 19, Drizzle/Postgres, `sharp` (already used by `src/lib/images.ts`), vitest (node environment, `renderToStaticMarkup` for components), Playwright for the e2e spec.

**Spec:** `docs/superpowers/specs/2026-11-17-tidy-up-page-design.md`, sections "Photos, as revised" and "Photos" (and the mockup at https://claude.ai/artifact/ARwfwRCCRaR9s6Qs1qTPtz). This is plan 2 of 6; plan 1 (the printable-version icon) is merged. Later plans add the Duplicates, TTB approvals and Missing details sections to this same page.

## Global Constraints

- The page is named **Housekeeping**, route `/housekeeping`, signed-in only, scoped to the current account (`requireSession()` then every query filtered by `ownerId`).
- Three tabs, in this order, with counts: `labels` "Labels", `barrels` "Single & private barrels", `vintages` "Vintages". Default tab `labels`.
- Per-page choices `8, 12, 24, 48`, default `8`. Previous and Next buttons. A range line such as `1–8 of 11 · page 1 of 2`. No Skip button, no refilling queue, no "show next" button.
- **The 600 px minimum applies only to uploads made through this page**: an image whose **longer side is under 600 px** is refused, for files, pasted images and links alike, with exactly: `That image is 284 × 213 px. Photos need at least 600 px on the long side.` (width × height of the rejected image). The label form, vintage page and bottle page are unchanged.
- "Missing" rules: a **label** is missing when `expressions.photo_path IS NULL` (its own photo; the grid's fallback to a bottle or vintage photo does not count). A **vintage** is missing when `expression_releases.photo_path IS NULL`. A **barrel** is a bottle with `is_single_barrel` or `is_single_barrel_pick` true and no row in `bottle_images`. Wishlist bottles are included.
- Photos reuse the existing routes: `POST /api/expressions/[id]/photo` (field `photo` or `imageUrl`), `POST /api/expressions/[id]/vintages/[vintageId]/photo` (same), `POST /api/bottles/[id]/images` (field `images` or `imageUrl`; its first image becomes the bottle's primary catalog photo and also fills an empty label photo). Remote links keep going through `fetchRemoteImage`.
- Error text appears in the controls' existing destructive line. Card copy: `No photo yet`, `Photo added.`.
- Mirror the Labels list for how a label's title is shown (brand name, then label name). New files use the `@/` alias. Square corners; use the existing `Polaroid`, `Button` and `Input` components.
- Do not touch the other pages' existing behaviour: with no `source` field a request behaves exactly as today.

## Review Focus

- **A pasted or dropped non-image** (text, a PDF, several files) must not be posted; the card says it needs an image. Test pins the file filter.
- **The 600 px rule must not leak** to the label form, vintage page or bottle page. Test pins that a request without `source` gets no minimum, and the controls add the flag only when asked.
- **Bad paging parameters** (`page=99`, `page=0`, `page=abc`, `per=7`, `tab=nonsense`) must fall back or clamp, never error or show an empty page 99. Test pins both helpers.
- **Another account's rows** must never be listed or counted, and the routes already refuse another account's ids. Integration test seeds two owners.
- **Pasting or dropping twice while a save is running** must not post twice. The card hands the file to the controls, which ignore it while busy. e2e pins it.

---

### Task 1: The minimum-size rule and the `source` flag on the three upload routes

**Files:**
- Modify: `src/lib/images.ts`
- Create: `src/lib/housekeeping/upload-options.ts`
- Modify: `src/app/api/expressions/[id]/photo/route.ts`, `src/app/api/expressions/[id]/vintages/[vintageId]/photo/route.ts`, `src/app/api/bottles/[id]/images/route.ts`
- Test: `src/lib/__tests__/images-min-size.test.ts`, `src/lib/housekeeping/__tests__/upload-options.test.ts`

**Interfaces:**
- Produces in `src/lib/images.ts`:
  - `export const HOUSEKEEPING_MIN_LONG_SIDE = 600`
  - `export type StoreOptions = { minLongSide?: number }`
  - `export function longSideError(width: number, height: number, min: number): string | null`
  - `storeBottleImage(file: File, options?: StoreOptions): Promise<StoredImage>` and `storeBottleImageBytes(bytes: Buffer, contentType: string, options?: StoreOptions): Promise<StoredImage>` (the new parameter is optional, so every existing caller is unchanged).
- Produces in `src/lib/housekeeping/upload-options.ts`: `export function housekeepingStoreOptions(formData: FormData): StoreOptions` returning `{ minLongSide: HOUSEKEEPING_MIN_LONG_SIDE }` when `formData.get("source") === "housekeeping"`, else `{}`.

- [ ] **Step 1: Set up the branch.** The worktree `.claude/worktrees/housekeeping-photos` on `claude/housekeeping-photos` (from `origin/main`) already exists; run `npm ci` there if `node_modules` is missing. Commit this plan file as its first commit.

- [ ] **Step 2: Write the failing tests.**
  - `images-min-size.test.ts`: `longSideError(284, 213, 600)` equals `"That image is 284 × 213 px. Photos need at least 600 px on the long side."`; `longSideError(600, 100, 600)` and `longSideError(100, 600, 600)` and `longSideError(900, 700, 600)` are `null`; `longSideError(599, 599, 600)` is the message with `599 × 599`. Then, with `UPLOAD_DIR` pointed at a fresh temp directory (set before `env()` is first read; if `env()` caches, use `vi.stubEnv` plus a dynamic import), a `sharp`-made 300×200 PNG passed to `storeBottleImageBytes(buffer, "image/png", { minLongSide: 600 })` rejects with an `ImageError` carrying that message and leaves no file under the temp directory; the same buffer with no options is stored; a 900×700 PNG with `{ minLongSide: 600 }` is stored.
  - `upload-options.test.ts`: a `FormData` with `source=housekeeping` gives `{ minLongSide: 600 }`; one with no `source`, or `source=other`, gives `{}`.

- [ ] **Step 3: Run them to see them fail.** `npx vitest run src/lib/__tests__/images-min-size.test.ts src/lib/housekeeping/__tests__/upload-options.test.ts`. Expected: FAIL (missing exports).

- [ ] **Step 4: Implement the rule.** In `src/lib/images.ts` add the constant, `StoreOptions`, and `longSideError` (pure; `Math.max(width, height) < min` gives the message, using `×`). Thread `options?: StoreOptions` through `storeBottleImage` → `storeImage` → `storeImageBytes`, and in `storeImageBytes` call it right after `meta.width`/`meta.height` are known and **before** anything is written (move the `mkdir` calls after it if they currently run first), throwing `ImageError(message)`. Add `upload-options.ts` as specified.

- [ ] **Step 5: Wire the three routes.** In each route, compute `const options = housekeepingStoreOptions(formData)` after `formData` is read and pass it as the last argument to every `storeBottleImage` and `storeBottleImageBytes` call (the bottle route has both in its `sources` list). No other change.

- [ ] **Step 6: Run the tests to see them pass**, then the whole `npx vitest run src/lib src/app` set. Expected: PASS, no other test changed.

- [ ] **Step 7: Commit.** `git add -A && git commit -m "Refuse low-resolution photos on uploads that ask for it"`.

---

### Task 2: URL parameters and paging helpers

**Files:**
- Create: `src/lib/housekeeping/photo-params.ts`
- Test: `src/lib/housekeeping/__tests__/photo-params.test.ts`

**Interfaces:**
- Produces:
  - `export const PHOTO_TABS = ["labels", "barrels", "vintages"] as const; export type PhotoTab = (typeof PHOTO_TABS)[number]`
  - `export const PER_PAGE_OPTIONS = [8, 12, 24, 48] as const; export type PerPage = (typeof PER_PAGE_OPTIONS)[number]; export const DEFAULT_PER: PerPage = 8`
  - `export function parsePhotoParams(sp: Record<string, string | string[] | undefined>): { tab: PhotoTab; per: PerPage; page: number }` (`page` is a positive integer, 1 when missing or invalid; first value wins if an array)
  - `export function pageWindow(total: number, per: number, page: number): { page: number; pages: number; from: number; to: number; offset: number }` (`page` clamped into `1..pages`; `pages` is at least 1; `from`/`to` are 1-based for display and both 0 when `total` is 0; `offset = (page - 1) * per`)

- [ ] **Step 1: Write the failing tests.** `parsePhotoParams({})` is `{ tab: "labels", per: 8, page: 1 }`; `{ tab: "barrels", per: "24", page: "3" }` parses; `{ tab: "nonsense" }`, `{ per: "7" }`, `{ per: "abc" }`, `{ page: "0" }`, `{ page: "-2" }`, `{ page: "abc" }`, `{ page: "2.5" }` each fall back to the default; an array value uses its first entry. `pageWindow(11, 8, 1)` is `{ page: 1, pages: 2, from: 1, to: 8, offset: 0 }`; `pageWindow(11, 8, 2)` has `from: 9, to: 11, offset: 8`; `pageWindow(11, 8, 99)` clamps to page 2; `pageWindow(0, 8, 1)` is `{ page: 1, pages: 1, from: 0, to: 0, offset: 0 }`; `pageWindow(8, 8, 1)` has `pages: 1`.
- [ ] **Step 2: Run to see them fail.** `npx vitest run src/lib/housekeeping/__tests__/photo-params.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement both functions** in `photo-params.ts` (pure, no imports from the app).
- [ ] **Step 4: Run to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add Housekeeping photo paging parameters"`.

---

### Task 3: The queries

**Files:**
- Create: `src/lib/housekeeping/photo-queries.ts`
- Test: `src/lib/housekeeping/__tests__/photo-queries.integration.test.ts` (skipped without a database, like `src/lib/tournaments/__tests__/lifecycle.integration.test.ts`; mock `server-only` the same way)

**Interfaces:**
- Consumes: `PhotoTab` from Task 2.
- Produces:
  - `export type MissingPhoto = { key: string; name: string; meta: string; seed: number; target: { kind: "label"; expressionId: number } | { kind: "vintage"; expressionId: number; vintageId: number } | { kind: "barrel"; bottleId: number } }` (`key` is unique across tabs, e.g. `label:12`; `seed` is the row id, for the frame's tilt)
  - `export async function countMissingPhotos(ownerId: number): Promise<Record<PhotoTab, number>>`
  - `export async function listMissingPhotos(ownerId: number, tab: PhotoTab, offset: number, limit: number): Promise<MissingPhoto[]>`

- [ ] **Step 1: Write the failing integration test.** Against a scratch database (see memory `bulk-editor-verification-recipe.md` for the throwaway DB recipe; assert the database name before any reset), seed two owners. Owner A: label L1 (no photo, 2 bottles), L2 (own photo set), L3 (no photo, no bottles); a barrel bottle B1 (`is_single_barrel`, no images) on L1, B2 (`is_single_barrel_pick`, with a `bottle_images` row), B3 (not a barrel, no images); vintage V1 (no photo) and V2 (own photo) on L2. Owner B: one label with no photo. Assert `countMissingPhotos(A)` is `{ labels: 2, barrels: 1, vintages: 1 }`; `listMissingPhotos(A, "labels", 0, 8)` returns L1 then L3 in a stable order (brand name, label name, id) and nothing of owner B's; `offset`/`limit` page correctly (`listMissingPhotos(A, "labels", 1, 1)` is `[L3]`); the barrels list has B1 with `target.kind === "barrel"`; the vintages list has V1 with both ids in its target; `name` shows brand then label name; `meta` for a label includes its category and bottle count, for a barrel its category and barrel number when set, for a vintage its name and year when set.
- [ ] **Step 2: Run it against the scratch database to see it fail.** Set `DATABASE_URL` to the scratch database and run `npx vitest run src/lib/housekeeping/__tests__/photo-queries.integration.test.ts`. Expected: FAIL (module not found). Without a database it is skipped, which CI also does.
- [ ] **Step 3: Implement the two functions** in `photo-queries.ts` (`import "server-only"`; Drizzle against `expressions`, `brands`, `categories`, `expressionReleases`, `bottles`, `bottleImages`; owner-scoped; the "missing" rules from Global Constraints; one count query per tab). Bottle counts for the label meta come from a count subquery, not per-row queries.
- [ ] **Step 4: Run against the scratch database to see it pass.** Expected: PASS. Drop the scratch database afterwards.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the Housekeeping missing-photo queries"`.

---

### Task 4: `LabelPhotoControls` learns bottles, the flag, and a handed-in file

**Files:**
- Modify: `src/components/expressions/label-photo-controls.tsx`
- Test: `src/components/expressions/__tests__/label-photo-controls.test.tsx`

**Interfaces:**
- Produces:
  - `export function uploadTarget(t: { expressionId: number; releaseId?: number; bottleId?: number }): { url: string; field: "photo" | "images" }` — bottle: `/api/bottles/${bottleId}/images` with `images`; vintage: `/api/expressions/${expressionId}/vintages/${releaseId}/photo` with `photo`; else `/api/expressions/${expressionId}/photo` with `photo`.
  - `export type LabelPhotoControlsHandle = { uploadFile: (file: File) => void }`
  - `LabelPhotoControls` becomes a `forwardRef` component with the new optional props `bottleId?: number`, `housekeeping?: boolean` (when true, adds `source=housekeeping` to every request), `refreshOnSave?: boolean` (default `true`; when `false`, no `router.refresh()` after a save), `onSaved?: () => void` (called after a successful save). `uploadFile(file)` does nothing while a save is running. When `bottleId` is set the hidden file input's `aria-label` is `Upload bottle photo` (otherwise `Upload label photo`, as today).

- [ ] **Step 1: Write the failing tests** with `renderToStaticMarkup` and direct calls: `uploadTarget` returns the three url/field pairs above; the default render (no new props) still shows `Add photo` and `From a link` and is byte-for-byte unchanged in its button labels; a render with `hasPhoto` still shows `Remove`.
- [ ] **Step 2: Run to see them fail.** `npx vitest run src/components/expressions/__tests__/label-photo-controls.test.tsx`. Expected: FAIL (`uploadTarget` not exported).
- [ ] **Step 3: Implement.** Export `uploadTarget` and use it in `upload()` (the form field name comes from it); append `source` when `housekeeping`; gate `router.refresh()` on `refreshOnSave`; call `onSaved` when `result.ok`; add the `forwardRef` handle with `useImperativeHandle`, guarded by the existing `busy` state. Behaviour with none of the new props must be identical to today.
- [ ] **Step 4: Run to see them pass**, plus `npx vitest run src/components/expressions`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Let the photo controls target a bottle and take a handed-in file"`.

---

### Task 5: The photo card

**Files:**
- Create: `src/components/housekeeping/photo-card.tsx`
- Test: `src/components/housekeeping/__tests__/photo-card.test.tsx`

**Interfaces:**
- Consumes: `MissingPhoto` (Task 3); `LabelPhotoControls`, `LabelPhotoControlsHandle` (Task 4); `Polaroid` from `@/components/ui/polaroid`.
- Produces: `export function PhotoCard({ item }: { item: MissingPhoto }): React.ReactElement` and `export function firstImage(files: FileList | File[] | null | undefined): File | null` (the first file whose `type` starts with `image/`, else `null`).

- [ ] **Step 1: Write the failing tests.** `firstImage` returns the PNG from `[text file, png]`, returns `null` for `[pdf]`, for `[]`, for `null` and for `undefined`. A static render of a label card shows the name, the meta, `No photo yet`, `Add photo` and `From a link`, and the root has `tabindex="0"` and the focus ring class; a render for a barrel item contains `aria-label="Upload bottle photo"` and not `Upload label photo`.
- [ ] **Step 2: Run to see them fail.** `npx vitest run src/components/housekeeping/__tests__/photo-card.test.tsx`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `PhotoCard`** as a client component: root `div` with `tabIndex={0}`, a visible focus ring (`focus-visible:ring-2 focus-visible:ring-ring`), `onPaste` and `onDrop` (preventing default and taking `firstImage(...)` from `clipboardData.files` / `dataTransfer.files`, handing it to the controls' `uploadFile`; a non-image shows `That needs to be an image.` in the existing error style), and `onDragOver` preventing default. It renders `Polaroid` (`seed={item.seed}`, a `No photo yet` well), the name in `font-semibold`, the meta in muted small text, and `LabelPhotoControls` with props from `item.target`, `hasPhoto={false}`, `housekeeping`, `refreshOnSave={false}`, and `onSaved` setting a local `done` state. When `done`, the controls are replaced by `Photo added.` (success colour) and the card is dimmed.
- [ ] **Step 4: Run to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add the Housekeeping photo card"`.

---

### Task 6: The page, tabs, pager and menu link

**Files:**
- Create: `src/app/(app)/housekeeping/page.tsx`, `src/components/housekeeping/photos-section.tsx`, `src/components/housekeeping/per-page-select.tsx`
- Modify: `src/components/app-nav.tsx`

**Interfaces:**
- Consumes: `parsePhotoParams`, `pageWindow`, `PHOTO_TABS`, `PER_PAGE_OPTIONS` (Task 2); `countMissingPhotos`, `listMissingPhotos` (Task 3); `PhotoCard` (Task 5).
- Produces: the route `/housekeeping?tab=&per=&page=`; `PerPageSelect({ per }: { per: number })`, a client component whose `<select aria-label="Per page">` calls `router.replace` with `per` set and `page` removed.

- [ ] **Step 1: Page.** `page.tsx` (`dynamic = "force-dynamic"`, `metadata.title = "Housekeeping"`): `requireSession()`, `await` the `searchParams`, parse them, fetch the counts, compute `pageWindow(counts[tab], per, page)`, fetch that page of items, and render the heading `Housekeeping`, a one-line lede (`N items are waiting for a photo.`, or `Every label, barrel and vintage has a photo.` when all counts are zero), and `PhotosSection`. If the requested page was clamped, the rendered page is the clamped one.
- [ ] **Step 2: Section.** `photos-section.tsx` renders the `Photos` heading with the one-line explanation from the mockup, the three tabs as links (label, count, `aria-current="page"` on the active one; each link keeps `per` and resets `page`), the paste/drop hint line, the `PerPageSelect`, a grid of `PhotoCard`s (`grid-cols-2` on phones, three on tablets, four on desktop, `key={item.key}`), an empty state per tab (`Nothing left to photograph here.`), and below it the range line plus Previous and Next as links (disabled, non-link, at the ends).
- [ ] **Step 3: Menu.** Add `{ href: "/housekeeping", label: "Housekeeping" }` to the list in `src/components/app-nav.tsx`, between `Numbers` and `Configuration`.
- [ ] **Step 4: Typecheck, lint, unit.** `npm run typecheck && npx eslint src/app/\(app\)/housekeeping src/components/housekeeping src/components/app-nav.tsx && npx vitest run src/components src/lib/housekeeping`. Expected: all pass.
- [ ] **Step 5: Look at it.** Follow the dev-server recipe in memory (`dev-server-use-localhost.md`, `bulk-editor-verification-recipe.md`): throwaway database, `next dev -p 1966` on `localhost`, sign in as `member`. Seed 11 unpictured labels, 5 barrels and 4 vintages, then check: the three tabs and counts, 8 per page with `1–8 of 11`, Next/Previous, the per-page select at 12/24/48, a bad URL like `?page=99&per=7&tab=x` falls back, and the page at 390 px wide has no horizontal scroll. Take a screenshot and read it. Record anything that could not be checked.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add the Housekeeping page with a paged photo grid"`.

---

### Task 7: The end-to-end spec

**Files:**
- Create: `e2e/housekeeping-photos.spec.ts`, `e2e/fixtures/tiny.png` (a 300×200 PNG; keep it under 5 KB)
- Modify: none

**Interfaces:**
- Consumes: the page and routes from Tasks 1 to 6; `signIn` and `resetDatabase` from `e2e/support`; seeding the way `e2e/support/tournament-field.ts` does it; the existing `e2e/fixtures/bottle.jpg` as the acceptable photo (check it is at least 600 px on its long side, and replace the check with a larger fixture if not).

- [ ] **Step 1: Write the spec** (read `e2e/tournaments.spec.ts` for the `assertThrowawayDatabase`, `resetDatabase`, `signIn` pattern first). Cases: (a) the page lists 8 cards by default and `Next` shows the rest; choosing `12` per page changes the URL to `per=12`; (b) choosing a file `tiny.png` on a card shows `That image is 300 × 200 px. Photos need at least 600 px on the long side.` and the card stays; (c) choosing `bottle.jpg` shows `Photo added.` on that card without the card vanishing, and after a reload the label is no longer listed; (d) a drop of `bottle.jpg` and a paste of it (synthetic `DragEvent` and `ClipboardEvent` built in `page.evaluate` with a `DataTransfer` holding the fixture bytes) each save; a drop of a text file shows `That needs to be an image.`; (e) dropping twice quickly on one card results in one saved photo (check one `POST`); (f) the barrels tab saves to the bottle (the bottle then has one catalog photo); (g) the label page's own photo form still accepts the 300×200 image (the minimum is not applied there).
- [ ] **Step 2: Run it against the scratch database to see it fail or pass.** `npx playwright test e2e/housekeeping-photos.spec.ts --trace off`. Expected: PASS once the earlier tasks are in. Any failure is a finding: fix the code, not the test.
- [ ] **Step 3: Run the existing photo and label specs** that exercise the same routes (`e2e/expressions.spec.ts`, `e2e/catalog.spec.ts`) and report any failure by name, noting whether it also fails on `main`.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add the Housekeeping photos end-to-end spec"`. In the PR, show the test counts: CI does not run Playwright or the database-backed suites.
