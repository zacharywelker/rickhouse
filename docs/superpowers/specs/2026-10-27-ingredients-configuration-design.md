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
| Presets (Molasses, Juniper, gin botanicals...) | Listed in Configuration as read-only **Built-in** rows. They stay in code. |
| Merge | Included. Entry point is a **Configuration row action only**. |
| Phasing | Two PRs inside this one spec. Phase 1 fixes the complaint. Phase 2 adds built-in rows and merge. |

## Phase 1: chips, page, filter, Ingredients resource

### Ingredient page

- Route `/ingredients/[id]`, `force-dynamic`, `requireSession()`.
- Loads the ingredient with `id` and `ownerId = user.id`. Not found or another account's id gives `notFound()`.
- Renders `EntityPage` with `kind="Ingredient"`, the name as title, a badge for the kind ("Rum base", "Gin base", "Botanical", "Maguey", "Distillate", "Flavor", "Vodka base", "Liqueur base"), the family as a second badge for distillates, `preset={{ ingredientIds: [id] }}`, and an empty message such as "No bottles on the shelf use this yet."

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
- Add form: Name (required, trimmed, max 120), Kind (select of the eight kinds, required), Family (select of grape, apple, pear, other; shown with `showWhenAny` only when Kind is distillate, required there).
- Edit form: Name and Family. Kind is read-only after creation, because moving a row to another kind could leave it linked to a label whose spirit rejects it (`ingredientAllowed`).
- Save: unique key is `(ownerId, kind, name)`. A collision returns a field error "Already exists." There is no auto-merge.
- Renaming goes through the row id, so every linked label updates at once.
- Delete: blocked while any label uses the row (`deleteBlockedBy: "N labels use this"`). The actual delete is one guarded statement (`DELETE ... WHERE id = $1 AND owner_id = $2 AND NOT EXISTS (SELECT 1 FROM expression_ingredients WHERE ingredient_id = $1)`), so a label saved between the check and the delete cannot be stripped by the `ON DELETE CASCADE`.
- Locked rows: Juniper under gin and genever, Blue Weber under tequila, and amaro style-derived botanicals show "Fixed" and have no rename or delete. The lock rule lives in one helper that the label save path also uses, so the two cannot disagree. The plan must locate how the label forms enforce Juniper, Blue Weber and style-derived botanicals today and reuse that, or extract it if it is inline.
- A new row created here has no label links. It appears as a suggestion in `IngredientPicker` for that kind, because the picker's known list reads all of the account's rows of the kind.

### API fix

- `GET /api/v1/ingredients` accepts all eight `INGREDIENT_KINDS`. Unknown kinds still return 422. The change is additive for iOS.

## Phase 2: built-in rows and merge

### Preset source

- New module `src/lib/expressions/ingredient-presets.ts` exports the preset names per kind, replacing:
  - `GIN_BASES` and `GIN_BOTANICALS` from `gin-details.ts` (re-exported from the new module so existing imports keep working),
  - `STANDARD_BASES` and the vodka list written inline in `ingredient-picker.tsx`.
- The iOS copy in `SpiritChoices.swift` stays as it is. The two lists can drift, which is the same risk the repo has today. The spec does not fix it.

### Built-in rows

- The Ingredients list merges the account's rows with the presets, matched on kind plus case-insensitive name. A match collapses into one row.
- A built-in row shows a "Built-in" tag, its Labels count (0 if unused), and no Edit, Delete or Merge-into actions. The picker would bring a renamed or deleted preset straight back.
- An unused built-in has no database row. It is shown with a negative synthetic id, no detail page, and no actions. It becomes a real row when a label uses it or when a merge targets it.
- `AdminRow` gains an optional `locked?: string` (the reason shown), used by both built-in and fixed rows. `ResourceView` hides Edit, Delete and Merge for a locked row.

### Merge

- Each custom (non-locked) row gets "Merge into..." in `ResourceView`, a new optional `mergeTargets` capability on `ResourceConfig` so other resources are unaffected.
- The picker lists other rows of the same kind. For distillates it lists only the same family, so a grape distillate cannot be folded into an apple one and break the Cognac and Calvados rules. Built-ins are valid targets, locked rows are never the loser.
- One transaction, rows locked with `FOR UPDATE`, both filtered by `ownerId`:
  1. If the target is an unused built-in, insert its row.
  2. For each label linking the loser: if it already links the target, delete the loser's link and set the target link's `isManual` to true if either was manual. Otherwise repoint the link, keeping its `position`.
  3. Delete the loser row.
- If the loser no longer exists the action returns "Already merged or deleted. Refresh." and writes nothing.
- Rename onto an existing name shows the collision error only. It does not offer merge.
- Merge is not offered from label forms, the ingredient page or iOS.

## Security

- Every server action and page calls `requireSession()` and filters by `ownerId`, including both rows in a merge and the `/ingredients/[id]` lookup.
- Zod validates kind (the eight values), family (grape, apple, pear, other) and name.
- No new authentication surface and no schema change in either phase.

## Testing

Vitest unless noted.

- Merge: survivor keeps `position` order; a label linking both ends with one link; `isManual` true if either was manual; kind or family mismatch refused; another account's row refused; locked row as loser refused; unused built-in survivor is created.
- Resource: collision gives a field error; locked names reject rename and delete; delete blocked while in use; kind cannot change on edit; family required for distillates only.
- Presets: one module, no case-insensitive duplicates within a kind; a database row matching a built-in collapses to one list row.
- Filter: `ingredientIds` round-trips through the URL like `finishIds`; the grid returns only labels linked to the ingredient.
- API: all eight kinds return 200; an unknown kind returns 422.
- Ownership: `/ingredients/[id]` for another account's id returns 404.
- Playwright: add a rum base in Configuration, find it in the label picker, save a label with it, follow the chip to a page that lists the bottle.

## Rollout

- No schema change, so no hand-written migration. No index on `expression_ingredients.ingredient_id`; the primary key does not serve it, but at this collection size the lookups are trivial. Add one if measured slow.
- Before branching, check `git ls-remote origin 'refs/heads/claude/*'` and `gh pr list --state all` for an existing branch or PR on this topic.
- Two PRs from fresh `origin/main`: Phase 1, then Phase 2.
- iOS: no change required.

## Out of scope

- An Ingredient control in the bottle filter bar.
- Tappable ingredient chips and a Configuration screen on iOS.
- Syncing the iOS preset lists with the web module.
- Merging across kinds.
