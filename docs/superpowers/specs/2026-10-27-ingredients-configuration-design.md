# Ingredients in Configuration, and clickable ingredient chips

Approved by the collection owner on 2026-10-27. Web only. iOS is out of scope except for one additive API fix.

## Problem

The spirit-specific label rules (2026-10-19 onward) moved rum bases, gin bases, botanicals, magueys, distillates, flavors and liqueur/vodka bases into reusable `ingredients` rows linked to labels through `expression_ingredients`. Nothing else was built around them:

- Every ingredient chip on the label page renders with `hrefFor={() => null}` (`src/app/(app)/expressions/[id]/page.tsx`). Finishes, mashbills, distilleries and brands link to a page that lists their bottles. Ingredients do not.
- Configuration (`src/lib/admin/registry.ts`, `RESOURCE_KEYS`) has nine resources and none is an ingredient. Ingredients can only be created inside the add or edit label flow, and cannot be renamed, merged, deleted or counted.
- `GET /api/v1/ingredients` accepts five of the eight kinds, so `vodka_base`, `flavor` and `liqueur_base` return 422. The server action `ingredientOptionsAction` already accepts all eight.

## Decisions

| Question | Decision |
| --- | --- |
| Surfaces | Web only. iOS tappable chips and an iOS Configuration screen are separate specs. |
| Configuration layout | One **Ingredients** resource (a tenth card) with a Kind column. Not one card per kind, not grouped by spirit. |
| Chip target | A dedicated `/ingredients/[id]` page built on `EntityPage`, plus an `ingredientIds` bottle filter. No slug, so no migration. |
| Presets (Molasses, Juniper, gin botanicals...) | They stay in code and read-only. Used presets are tagged **Built-in** in the table. Unused ones are listed in a separate read-only section. |
| Merge | Included. Entry point is a **Configuration row action only**. |
| Phasing | Two PRs inside this one spec. Phase 1 fixes the complaint. Phase 2 adds built-in rows and merge. |

## Phase 1: chips, page, filter, Ingredients resource

### Ingredient page

- Route `/ingredients/[id]`, `force-dynamic`, `requireSession()`.
- Loads the ingredient with `id` and `ownerId = user.id`. Not found or another account's id gives `notFound()`.
- Renders `EntityPage` with `kind="Ingredient"`, the name as title, a badge for the kind ("Rum base", "Gin base", "Botanical", "Maguey", "Distillate", "Flavor", "Vodka base", "Liqueur base"), the family as a second badge for distillates, `preset={{ ingredientIds: [id] }}`, and an empty message such as "No bottles on the shelf use this yet."
- **Also used as.** Below the badges, a line lists this account's other ingredient rows with the same name and a different kind, each with its bottle count and a link to its page (for example "Also: Vodka base, 3 bottles"). The shipped presets overlap heavily (Wheat, Rye, Potato, Corn and Grape across gin and vodka; Molasses and Sugarcane across gin and rum), so this is the common case. Each page stays per row: a gin base and a vodka base are separate facts. The query is scoped by `ownerId`.

### Bottle filter

- Add `ingredientIds: number[]` to `BottleFilters` (`src/lib/bottles/filters.ts`): default `[]`, parsed with `idList(params, "ingredient")`, serialised and counted exactly as `finishIds` is.
- In `src/lib/bottles/grid.ts`, add an `EXISTS` clause over `expression_ingredients` beside the `finishIds` clause.
- There is no filter-bar control in this spec. The URL parameter and the page preset are the only entry points.

### Linked chips

- `Links.ingredients` (`src/lib/expressions/save.ts`) and the query behind `links` on the label page must carry the ingredient `id`.
- Every `hrefFor={() => null}` for ingredient chips in `expressions/[id]/page.tsx` becomes `/ingredients/${item.id}`.
- Chips for built-in names that have no row yet cannot exist: a label only shows a chip for a linked row, and linking creates the row.

### Ingredients resource

- `ingredients` is added to `RESOURCE_KEYS` and to `RESOURCES` with a `ResourceConfig`, following the `cooperages` pattern, plus an `ingredientSchema` in `src/lib/admin/schemas.ts`.
- Columns: Name, Kind, Family, Labels (count of this account's labels using it).
- Add form: Name (required, trimmed, max 120), Kind (select of the eight kinds, required), Family (select of grape, apple, pear, other; required for distillates). `showWhenAny` only reacts to sibling boolean fields, so Family is shown only when Kind is Distillate by a resource-specific filter in `resource-form.tsx`, the same pattern the distilleries form uses for its DSP and NOM fields.
- Edit form: Name and Family. Kind is read-only after creation, because moving a row to another kind could leave it linked to a label whose spirit rejects it (`ingredientAllowed`).
- Save: unique key is `(ownerId, kind, name)`. A collision returns a field error "Already exists." There is no auto-merge.
- Built-in names are reserved. Add or rename onto a preset name for the same kind (case-insensitive) fails with "Sugarcane is a built-in choice." (Phase 2 appends " Use Merge into... to combine."), whether or not a label uses that preset yet. This stops a rename from silently turning a custom row into a locked Built-in row.
- Server-side enforcement (the UI hiding a control is not enforcement): `save()` ignores or rejects `kind` when editing; Zod requires `family` for distillates and forces it to null for every other kind; `save()` and `remove()` recheck the lock; `remove()` throws "N labels use this" when the guarded delete matches zero rows, so the action never reports "deleted" for a row that is still there.
- Renaming goes through the row id, so every linked label updates at once.
- Delete: blocked while any label uses the row (`deleteBlockedBy: "N labels use this"`). The actual delete is one guarded statement (`DELETE ... WHERE id = $1 AND owner_id = $2 AND NOT EXISTS (SELECT 1 FROM expression_ingredients WHERE ingredient_id = $1)`), so a label saved between the check and the delete cannot be stripped by the `ON DELETE CASCADE`.
- Locked rows show "Fixed" and have no rename or delete. A row is locked when any of its links has `is_manual = false` (a style-derived botanical such as Artichoke, Rhubarb or Wormwood on an amaro), or when it is a built-in (Juniper and Blue Weber are presets). The lock comes from data, not a name list: an amaro save re-adds those botanicals by name, so a rename would be silently undone, but Wormwood on a gin label stays editable until an amaro style links it. The lock rule lives in one helper that the label save path also uses, so the two cannot disagree. The plan must locate how the label forms enforce Juniper, Blue Weber and style-derived botanicals today and reuse that, or extract it if it is inline.
- A new row created here has no label links. It appears as a suggestion in `IngredientPicker` for that kind, because the picker's known list reads all of the account's rows of the kind.

### API fix

- `GET /api/v1/ingredients` accepts all eight `INGREDIENT_KINDS`. Unknown kinds still return 422. The change is additive for iOS.

## Phase 2: unused built-ins and merge

The preset module, the `locked` row plumbing, the reserved-name rule and the Built-in and Fixed tags land in Phase 1, because the reserved-name rule and the locks need them. Phase 2 adds the unused-built-ins section, Merge, and the "Use Merge into... to combine." pointer on the reserved-name message.

### Preset source (lands in Phase 1)

- New module `src/lib/expressions/ingredient-presets.ts` exports the preset names per kind, replacing:
  - `GIN_BASES` and `GIN_BOTANICALS` from `gin-details.ts` (re-exported from the new module so existing imports keep working),
  - `STANDARD_BASES` and the vodka list written inline in `ingredient-picker.tsx`.
- The iOS copy in `SpiritChoices.swift` stays as it is. The two lists can drift, which is the same risk the repo has today. The spec does not fix it.

### Built-in rows

- The main table lists real rows only. A real row whose kind and case-insensitive name match a preset shows a "Built-in" tag, its Labels count, and no Edit, Delete or Merge-into actions. The picker would bring a renamed or deleted preset straight back.
- Unused presets are not rows. They appear in a separate read-only section under the table, "Built-in choices not used yet", grouped by kind as plain text with no ids, no actions and no dialogs. No negative or synthetic ids exist anywhere.
- `ResourceView` gains an optional `footer` slot for that section, rendered by the server page. The Configuration card count is the number of real rows, so a new account does not show roughly 70 ingredients it never created.
- `AdminRow` gains an optional `locked?: string` (the reason shown), used by built-in and fixed rows. `ResourceView` hides Edit, Delete and Merge for a locked row.
- Built-ins stay read-only on purpose: they are constants in code, and the picker unions them with the account's rows by name, so a rename or delete would be undone. Hiding or respelling presets would mean moving them into the database for every account and removing the copies from the web picker and iOS `SpiritChoices.swift`. That is a separate spec spanning web and iOS.

### Merge

- Each custom (non-locked) row gets "Merge into..." in `ResourceView`, a new optional `mergeTargets` capability on `ResourceConfig` so other resources are unaffected.
- The picker lists other rows of the same kind. For distillates it lists only the same family, so a grape distillate cannot be folded into an apple one and break the Cognac and Calvados rules. Built-ins are valid targets, locked rows are never the loser.
- One transaction, rows locked with `FOR UPDATE`, both filtered by `ownerId`:
  1. If the target is an unused built-in, insert its row.
  2. For each label linking the loser: if it already links the target, delete the loser's link and set the target link's `isManual` to true if either was manual. Otherwise repoint the link, keeping its `position`.
  3. Renumber all of each affected label's ingredient links to a dense `0..n-1`, keeping their current order, so two links never tie on `position`. A label's ingredients share one position sequence (gin keeps botanicals and bases together), so renumbering only the merged kind would collide with the others.
  4. Delete the loser row.
- Merge is irreversible, so it requires a confirm dialog that states the effect and the count: "Merge 'Sugar cane' into 'Sugarcane'? 3 labels will use Sugarcane. 'Sugar cane' will be deleted. This can't be undone." The count is the row's Labels cell, which `list()` already scopes by `ownerId`.
- After a merge or rename the action revalidates the Configuration page, the label pages and the collection.
- If the loser no longer exists the action returns "Already merged or deleted. Refresh." and writes nothing.
- Accepted limits, documented rather than fixed. A label form opened before a merge, or an iOS picker holding a cached list, submits the old name and the label save re-creates it, because the save path upserts by `(owner, kind, name)`; the success message says open label forms may need a refresh. A label save running at the same moment as a merge in another tab can fail on the foreign key and roll back; the error reads "Something changed while saving. Try again."
- Rename onto an existing name shows the collision error only. It does not offer merge.
- Merge is not offered from label forms, the ingredient page or iOS.

## Security

- Every server action and page calls `requireSession()` and filters by `ownerId`, including both rows in a merge, the merge confirm count, the `/ingredients/[id]` lookup and the "Also used as" query.
- Zod validates kind (the eight values), family (grape, apple, pear, other) and name.
- No new authentication surface and no schema change in either phase.

## Testing

Vitest unless noted.

- Merge: survivor keeps `position` order; a label linking both ends with one link; `isManual` true if either was manual; kind or family mismatch refused; another account's row refused; locked row as loser refused; unused built-in survivor is created.
- Resource: collision gives a field error; add or rename onto a built-in name is rejected with the Merge pointer; locked rows (built-in, or any `is_manual = false` link) reject rename and delete on the server, not just in the UI; Wormwood on a gin-only account stays editable; delete blocked while in use and `remove()` throws rather than reporting success on zero rows; a request that sends a different `kind` on edit is ignored or rejected; family required for distillates and nulled for other kinds.
- Presets: one module, no case-insensitive duplicates within a kind; a database row matching a built-in is tagged Built-in rather than listed twice; unused presets appear only in the read-only section; the card count equals the number of real rows.
- Merge: the confirm count matches the labels actually repointed; positions are dense `0..n-1` afterwards.
- Also used as: lists same-name rows of other kinds with correct counts, and never shows another account's same-name ingredient.
- Filter: `ingredientIds` round-trips through the URL like `finishIds`; the grid returns only labels linked to the ingredient.
- API: all eight kinds return 200; an unknown kind returns 422.
- Ownership: `/ingredients/[id]` for another account's id returns 404.
- Playwright: add a rum base in Configuration, find it in the label picker, save a label with it, follow the chip to a page that lists the bottle.

## Known simplification

Botanical presets are gin's list, so an amaro botanical with the same name (for example "Lemon") also shows as Built-in. It is the same name, so this is harmless.

## Rollout

- No schema change, so no hand-written migration. No index on `expression_ingredients.ingredient_id`; the primary key does not serve it, but at this collection size the lookups are trivial. Add one if measured slow.
- Before branching, check `git ls-remote origin 'refs/heads/claude/*'` and `gh pr list --state all` for an existing branch or PR on this topic.
- Two PRs from fresh `origin/main`: Phase 1, then Phase 2.
- iOS: no change required.
- Phase 1 is complete on its own and does not depend on phase 2. Phase 2 can be reverted as a PR with no data change, except for ingredients already merged, which stay merged. That is why the merge confirm dialog is required.

## Out of scope

- An Ingredient control in the bottle filter bar.
- Tappable ingredient chips and a Configuration screen on iOS.
- Syncing the iOS preset lists with the web module.
- Merging across kinds.

## Stress Test Results: ingredients in Configuration

Run 2026-10-27. 8 branches interrogated, 8 resolved (4 changed the design, 4 accepted as written).

### Resolved Decisions
- **Built-in names are reserved.** Add or rename onto a preset name fails with a pointer to Merge, so a rename cannot silently turn a custom row into a locked one.
- **Locks come from data, not a name list.** A row is Fixed when any link has `is_manual = false`, or when it is a built-in. Wormwood on a gin stays editable.
- **Pages stay per row, plus an "Also used as" line.** Shipped presets overlap heavily across kinds, so a click on Wheat should offer one step to the vodka row. Per-name pages were rejected as too coarse (a rum base and a flavor are different facts).
- **Built-ins stay read-only**, with unused ones in a separate section and no synthetic ids. Hiding or respelling presets is a different, larger feature.
- **Server-side enforcement** for kind immutability, family rules, locked rows, and a delete that matches zero rows.
- **Merge** requires a confirm dialog with the affected-label count, renumbers positions, and documents two accepted limits (stale forms re-create a merged name; a simultaneous label save can fail and retry).
- **Security:** no control weakened. The new "Also used as" query is scoped by `ownerId` and tested.
- **Scale and rollback:** no index needed; no schema change, so rollback is a PR revert. Merged rows are the only irreversible data.

### Changes Made
- Ingredient page: added "Also used as".
- Ingredients resource: reserved built-in names, data-derived locks, server-side enforcement bullets.
- Phase 2: built-ins shown as tags on real rows plus a read-only footer section (`footer` slot on `ResourceView`); removed negative synthetic ids; card count equals real rows.
- Merge: confirm dialog, dense renumbering, revalidation, accepted limits.
- Security, Testing and Rollout sections updated to match.

### Deferred / Parking Lot
- Hiding or respelling presets (move presets into the database for all accounts, web and iOS).
- An Ingredient control in the bottle filter bar.
- Tappable chips and a Configuration screen on iOS; syncing the iOS preset copy with the web module.
- A redirect from a merged name, so stale forms stop re-creating it.

### Confidence Assessment
- Overall: Medium-High.
- Areas of concern: Phase 2 changes the shared `ResourceView` (locked rows, Merge action, footer slot), which every Configuration resource uses, so it needs regression checks on the other nine. The plan must locate the existing Juniper, Blue Weber and style-derived enforcement before extracting the lock helper.
