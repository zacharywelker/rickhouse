# Add-bottle redesign, phase 3: the category tree and its kinds

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the shared category tree to the target in the design record (section 5), give every new subcategory its own kind (section 6), and encode the field matrix (sections 7 and 8) as data with a test that shows where today's rules differ from it. No form changes: those are phase 4.

**Architecture:** Every existing category keeps its `id` and `slug`, so **no label, bottle or smart group is re-pointed**: the migration only changes parents, names and sort order, and adds new rows. One module, `src/lib/categories/tree.ts`, becomes the single source for the tree (the seed and the tests import it). Kinds are still derived from slugs by walking parents (`categoryKinds`), extended with the new kinds. The only data that references the old shape is saved smart groups (a `category=` id list in `groups.filter_query`), which a step in the migration rewrites.

**Tech Stack:** Drizzle/Postgres hand-written SQL migration, vitest (pure and opt-in database tests), TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-23-add-bottle-redesign-design.md` (sections 5 to 9 and 12).

## Correction to the earlier plan

The phases 1 and 2 summary called this phase "the real risk" because every label would have to be remapped. That is not so. Because ids and slugs stay, a label on Bourbon is still on Bourbon and still the `american` kind afterwards. The risks that remain are listed under **Review Focus**: consumers that assume the old parent chain, saved smart groups, and old iOS builds.

## Decisions needed before Task 3 (my recommendation first)

1. **The "Whiskey" umbrella goes away.** The target has American Whiskey, Irish Whiskey and Scotch as top categories, and **Whisky** (Canadian, Japanese, Other International, Flavored) beside them. The existing top row (id kept, slug `whiskey`) is renamed Whisky and keeps only Canadian. A filter on "Whiskey" used to match every whiskey; it will match only those four. *Recommend:* accept, and rewrite saved smart groups (Task 4) so they keep matching what they matched.
2. **Names.** The design table says Wheat, Corn, Light; the rows are called Wheat Whiskey, Corn Whiskey, Light Whiskey. *Recommend:* keep the current names (the table is shorthand) and add Tennessee.
3. **Amaro.** The table lists a subcategory "Amaro" under Amaro. A second row with the slug `amaro` is not possible and a same-name child adds nothing. *Recommend:* leave Amaro as it is, a top category with no children.
4. **Slugs for the new rows**, chosen to equal their kinds so `SPECIAL_KINDS` in `rules.ts` already finds them: `tennessee` (kind `american`, under American Whiskey), `japanese`, `international`, `flavored-whisky`, `cachaca`, `agricole`, `spiced-rum`, `apple`, `eau-de-vie`, `absinthe`, `akvavit`, `shochu`, and a top `other` (group `other`). Display names as in the table.
5. **Retired fields** (Still proof, Chill filtered, Colour added, Char level, Bottle count) are **not touched here**; they leave the forms in phase 4. Recommend dormant columns now, a drop migration later.

## Global Constraints

- Every existing category keeps its `id` and `slug`. A migration step that changes either is a bug.
- The migration is hand-written (`drizzle-kit generate` fails here): `drizzle/0055_category_tree.sql` plus an entry in `drizzle/meta/_journal.json` with a `when` later than 0054's (`1793363374639`). It is idempotent, as `0047_spirit_category_tree.sql` is (`ON CONFLICT (slug) DO NOTHING`, `UPDATE … WHERE slug =`).
- On a fresh database migrations run before the seed, so the migration must do nothing harmful when `categories` is empty; the seed then creates the target tree from `CATEGORY_TREE`.
- Categories are shared by every account, edited only by an admin; the migration runs on every deployment's real database. **Back up first** (Admin → Backups, or `pg_dump`) and say so in the PR.
- `npm run lint`, `npx tsc --noEmit` and the vitest suite before every push. Database tests run against a throwaway database named with `test`, `scratch` or `proto`, with `TOURNAMENT_TEST_DATABASE_URL` set. Never source the main `.env` in a shell that runs a reset or migrate script; print the database name first.
- Codex is given pure functions only, started with the shell inside its worktree, and its work is committed from the main session.

## Review Focus

1. **A saved smart group** (`groups.filter_query = "category=<old Whiskey id>"`) must still match the same bottles after the migration (recursive subtree expansion in `src/lib/bottles/grid.ts:70` and `roulette.ts:34`).
2. **A label on the old top category itself** (category "Whiskey", id kept, renamed Whisky) stays valid, keeps its group `whiskey`, and gets kind `other`.
3. **An admin-added category** under the old Whiskey or American Whiskey (the tree is editable) keeps its parent and kind.
4. **Old iOS builds** read `GET /api/v1/categories`: `parent` names change (American Whiskey, Scotch Whisky and Irish Whiskey no longer have the parent "Whiskey") and new `kind` strings appear (`japanese`, `agricole`, …). The app compares kinds to known strings and treats others as unknown; check that before shipping.
5. **Tasting wheels** pick a wheel by category slug and parent chain (`src/lib/tasting-wheels/index.ts`); a label moved to a new parent must keep its wheel.

---

## Tasks

### Task 1: One source for the tree, and the new kinds

**Files:**
- Create: `src/lib/categories/tree.ts`, `src/lib/categories/__tests__/tree.test.ts`
- Modify: `src/lib/expressions/rules.ts` (the `CategoryKind` type, `SPECIAL_KINDS`, `categoryKinds`), `scripts/seed.ts` (imports the tree), `src/lib/expressions/__tests__/rules.test.ts`

**Interfaces:**
- Produces: `type CategoryNode = { name: string; slug: string; parent: string | null; fieldGroup: FieldGroup; sortOrder: number }`; `CATEGORY_TREE: readonly CategoryNode[]` (the target tree of section 5 with the slugs decided above, parents listed before their children); `CategoryKind` gains `japanese | international | flavored-whisky | cachaca | agricole | spiced-rum | apple | eau-de-vie | absinthe | akvavit | shochu`.
- Consumes: `FieldGroup` from `src/db/schema.ts`.

- [ ] **Step 1: Tests first.** In `tree.test.ts`: every non-null `parent` is a slug that appears earlier in the list; slugs are unique; `(name, parent)` pairs are unique; every node's `fieldGroup` equals its parent's (the section 5 table); the top-level names are exactly Agave, American Whiskey, Irish Whiskey, Scotch Whisky, Whisky, Vodka, Gin, Rum, Brandy, Liqueur, Other, Amaro; the children of each match the section 5 table by slug. In `rules.test.ts`: `categoryKinds` over `CATEGORY_TREE` (given ids by index) returns `american` for bourbon, tennessee and american-single-malt; `scotch` for the five Scotch rows; `canadian` for canadian-whisky; `japanese`, `international`, `flavored-whisky` for their rows; `cachaca`, `agricole`, `spiced-rum` for the rum rows; `apple`, `eau-de-vie`, `cognac` for brandy rows; `absinthe`, `akvavit`, `shochu` for the other rows; `other` for the Whisky and Other and Brandy and Rum top rows themselves.
- [ ] **Step 2: Run** `npx vitest run src/lib/categories src/lib/expressions/__tests__/rules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `tree.ts` (moving the array out of `scripts/seed.ts`, which now imports it) and the new kinds in `rules.ts`. The new slugs equal the kind names, so adding them to `SPECIAL_KINDS` is enough; `canadian-whisky` keeps its explicit branch. Rules that already key on `"other"` must still treat the new kinds like `other` (the matrix work that changes them is phase 4).
- [ ] **Step 4: Run the same tests, then** `npx vitest run src/lib/expressions` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: one category tree and the kinds the new subcategories need`.

### Task 2: The migration

**Files:**
- Create: `drizzle/0055_category_tree.sql`, `src/lib/categories/__tests__/migration.integration.test.ts`, `drizzle/rollback/0055_category_tree_down.sql`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: `CATEGORY_TREE` (Task 1), `connect`, `fixtures`, `url` from `src/lib/tournaments/__tests__/fixtures.ts` (the opt-in database harness).
- Produces: a database whose `categories` equal `CATEGORY_TREE` by `(slug, parent slug, field_group)`.

- [ ] **Step 1: Write the failing integration test** (skipped without `TOURNAMENT_TEST_DATABASE_URL`): build the **old** tree in a throwaway database (the rows `scripts/seed.ts` created before this change: copy that list into the test as `OLD_TREE`), create one label on every old category, record each label's `category_id` and the `categoryKinds` result per category, run `drizzle/0055_category_tree.sql`, then assert: every old slug still exists with the **same id**; every label's `category_id` is unchanged; each old category has the same kind as before (Bourbon `american`, Scotch rows `scotch`, Canadian `canadian`, …); the tree now equals `CATEGORY_TREE`; the old top row (slug `whiskey`) is named Whisky and has only Canadian and the three new children; running the file a second time changes nothing.
- [ ] **Step 2: Run it** with the throwaway URL. Expected: FAIL (no migration yet).
- [ ] **Step 3: Write the SQL**: (a) `UPDATE categories SET parent_id = NULL` for `american-whiskey`, `scotch`, `irish-whiskey`; (b) `UPDATE categories SET name = 'Whisky' WHERE slug = 'whiskey'`; (c) the new rows with `INSERT … SELECT … JOIN` on the parent slug and `ON CONFLICT (slug) DO NOTHING` (new top `other` first); (d) `sort_order` for every row from `CATEGORY_TREE`; (e) nothing that deletes a row. Add the journal entry.
- [ ] **Step 4: Run the test.** Expected: PASS. Also run the migration against a **fresh** empty database and confirm it applies cleanly and leaves `categories` empty (the seed fills it, Task 3).
- [ ] **Step 5: The down script** `drizzle/rollback/0055_category_tree_down.sql` re-parents the three rows under `whiskey`, renames it Whiskey and deletes the new rows **only if no label uses them** (it raises otherwise). Add a test case that applies it after the up migration on the test database and checks the old tree is back.
- [ ] **Step 6: Commit** `feat: migrate the category tree to the redesign (ids and slugs kept)`.

### Task 3: The seed and the fresh install

**Files:**
- Modify: `scripts/seed.ts`; Create: `src/lib/categories/__tests__/seed.integration.test.ts`

- [ ] **Step 1: Write the failing test** (opt-in): on an empty migrated database run the seed's category step; the result equals `CATEGORY_TREE`. On a database already migrated by Task 2, running the seed again changes no row.
- [ ] **Step 2: Run, fix** `seedCategories` (it must read `CATEGORY_TREE` and stay `ON CONFLICT (slug) DO NOTHING`), **run** until PASS. Note in the PR that the seed does not reparent: only the migration does, so a deployment that already has the old tree depends on the migration.
- [ ] **Step 3: Commit** `feat: seed the category tree from the shared module`.

### Task 4: Saved smart groups

**Files:**
- Modify: `drizzle/0055_category_tree.sql`; Test: the Task 2 integration test file

**Interfaces:**
- Consumes: `groups.filter_query` (`"category=1,2&store=3"`).

- [ ] **Step 1: Failing test.** Insert smart groups with `filter_query` values `category=<whiskey id>`, `category=<whiskey id>,<rum id>&pick=1`, `store=3` (no category) and `category=<bourbon id>`; after the migration the first two also list the ids of American Whiskey, Scotch Whisky and Irish Whiskey (so the recursive expansion matches what it matched before), the order and the other parameters are kept, and the last two are unchanged. Run the migration twice: no id is added twice.
- [ ] **Step 2: Implement** the rewrite in the migration as a `DO` block over `groups` rows with a non-null `filter_query` that mentions the old Whiskey id (looked up by slug, so no hard-coded number). Skip rows that already list the three ids.
- [ ] **Step 3: Run; commit** `feat: keep saved smart groups matching what they matched`.

### Task 5: Consumers of the parent chain

**Files (read each first; change only what the test shows is wrong):** `src/lib/bottles/grid.ts` (`whiskeyKind`, the subtree expansion), `src/lib/bottles/roulette.ts`, `src/lib/tasting-wheels/index.ts` (`categoryWheelMap`), `src/lib/bottles/category-palette.ts` and `ios/Rickhouse/Theme.swift`, `src/lib/admin/tree.ts` and the Categories page, `src/lib/expressions/label-search-docs.ts`, `src/app/api/v1/categories/route.ts`, and `e2e/*` specs that pick "Whiskey" or a category by parent.

- [ ] **Step 1: One failing test per consumer**, each run against `CATEGORY_TREE` (or the migrated test database): `whiskeyKind` gives `american` for Tennessee and `scotch` for a Scotch child; the subtree of American Whiskey contains its seven children and of Whisky contains four; `categoryWheelMap` returns for each old category the same wheel as before the migration (record the map from `OLD_TREE` first); `categoryColor` returns a colour (the default `OTHER` is acceptable: the owner redoes colours later) for every new category name without throwing; the API response lists the new `kind` strings and the new `parent` names.
- [ ] **Step 2: Fix** what fails; leave what passes alone. For the iOS contract (Review Focus 4) read how `ios/Rickhouse/LabelRules.swift` and `Models.swift` treat an unknown kind and write the result into the PR; change Swift only if an unknown kind breaks something.
- [ ] **Step 3: Update the e2e specs** that referred to the old parent, and run the affected ones (`e2e/catalog.spec.ts`, `e2e/columns.spec.ts`, `e2e/admin.spec.ts`) against a throwaway database.
- [ ] **Step 4: Commit** `fix: category consumers follow the new tree`.

### Task 6: The field matrix as data, and the gap list

**Files:**
- Create: `src/lib/expressions/field-matrix.ts`, `src/lib/expressions/__tests__/field-matrix.test.ts`

**Interfaces:**
- Produces: `type Cell = "always" | "never" | { when: string }`; `LABEL_MATRIX: Record<string, Record<FieldGroup, Cell>>` and `BOTTLE_MATRIX` with the rows of sections 7 and 8 (the row key is the field name in `src/lib/expressions/fields.ts` or `bottle-fields.ts`, or a documented pseudo-field for a derived item); `shownBy(matrix, field, group, kind): boolean | "conditional"` for the cells that are plain always or never.
- Consumes: `hiddenFields(context)` in `rules.ts` and `bottle-applicability.ts` as they are today.

- [ ] **Step 1: Write the test** as a table: for every field row and every field group where the matrix says always or never, compare with what `hiddenFields` and the bottle rules do today for a representative kind of that group. Conditional cells are listed, not asserted.
- [ ] **Step 2: Run it.** Expected: some rows FAIL. **Do not fix the rules here.** Convert each current mismatch into a `KNOWN_GAPS` entry (field, group, expected, found, which phase 4 task resolves it) so the suite passes and the list is the phase 4 input. A mismatch that is a mistake in the matrix itself is corrected in the design record instead.
- [ ] **Step 3: Commit** `test: the field matrix as data, with the differences from today's rules listed`.

### Task 7: Close out

- [ ] **Step 1:** Run the migration test and the seed test, `npm test`, `npx tsc --noEmit`, `npm run lint`; run the Task 5 e2e specs; put every count in the PR.
- [ ] **Step 2:** Update section 5, section 12 (the retired columns question, the unreviewed categories) and section 13 of the design record, and add an "As built" section to this plan.
- [ ] **Step 3:** PR description: the back-up instruction, the decisions taken (1 to 5), the iOS finding, and the saved-group rewrite.

---

## Suggested split of the work

Codex (pure functions, vitest only): Task 1, and the `shownBy` helper and the matrix constants in Task 6. Haiku: the e2e spec edits in Task 5 once the failing tests name them. Main session: Tasks 2 to 4 (SQL and the database harness), the audit in Task 5 and the gap list in Task 6. A Sonnet reviewer after each task; none on Opus.

## Self-review notes

- **Spec coverage:** section 5 is Tasks 1 to 3; section 6 is Task 1; sections 7 and 8 are Task 6 (data and gaps only; the rule changes are phase 4); the retired columns of section 12 are explicitly deferred. The photo model, the category colours and the unreviewed categories (Irish, Canadian, Japanese, International and Flavored rules) are not part of this phase.
- **Not verified while planning:** how the iOS app handles an unknown `kind` and a changed `parent` (Review Focus 4, read in Task 5); that `categoryWheelMap` depends only on slug and parent (read in Task 5); how many saved groups exist (the dev database has none worth counting); whether an old build of the app caches the category list.
- **Proportion:** each task gives signatures, test cases and the values the spec fixes; the SQL and the bodies are left to the implementer.
