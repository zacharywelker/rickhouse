# Ingredient shares (grapes and Calvados fruit): design

**Status:** approved by the owner on 2026-11-25 (storage, total check, roles, old tags). Not built.
**Part of:** the add-bottle redesign, phase 4B (`docs/superpowers/plans/2026-11-24-add-bottle-redesign-phase-4b-audit.md`, tasks 9 and the pear warnings of 10). Design record sections 4 and 9.

## Intent

Cognac, Armagnac and Pisco record their **grapes**, and Calvados its **fruit**, as a table of name and **share**, entered like a mashbill (design record, section 4). Today they are plain tags with no share. The owner wants to record what a label says ("Ugni Blanc 90%, Colombard 10%"), see Puro or Acholado worked out for a Peruvian pisco, and be told when a Calvados breaks its appellation's pear rule.

## Goals, non-goals

- **Goals:** a Share per grape or fruit row; a total; the grape lists per spirit; the Calvados fruit table (four apple types, Pears, an Apples subtotal, a Total); the Calvados pear warnings; shown on the detail pages and in the bulk editor.
- **Non-goals:** distillery shares (already built), mashbill/finish pairing, a main/secondary role stored on the label (decided: suggestions only), blocking a save over shares.
- **Anti-goal:** an existing label, or a phone edit, that loses its ingredients or shares.

## Decisions (owner, 2026-11-25)

1. **Storage: extend the ingredient links.** `expression_ingredients` gets a nullable `share_pct`. One mechanism for all four spirits. (Rejected: a Calvados-only table, two mechanisms; JSON on the label, not queryable.)
2. **Total check: always a warning.** Shares are optional per row. A total that is not 100 shows a note ("adds up to 70%") and never blocks a save.
3. **Main / secondary: suggestions only.** The grape box suggests the main grapes first, then the secondary ones. Nothing else is stored.
4. **Old Calvados tags are converted.** A migration turns the plain "Apple" tag of a Calvados label into an "Apples (type not stated)" row and "Pear" into the "Pears" row, with no share.

## Design

### Data

- Migration `0059`: `ALTER TABLE expression_ingredients ADD COLUMN share_pct numeric(5,2) CHECK (share_pct IS NULL OR share_pct BETWEEN 0 AND 100)`. Existing rows stay null. Rollback drops the column.
- Calvados conversion (same migration, data step): for each owner, create the ingredients `Apples (type not stated)` and `Pears` (kind `distillate`, families `apple` and `pear`) when missing, and repoint the `expression_ingredients` rows of **Calvados labels only** from the old `Apple`, `Cider Apple` and `Pear`, `Williams Pear` tags (the same tags also belong to apple brandy and eau de vie labels, which keep them). A rollback script moves them back by name. Test: a Calvados label, an apple brandy label and an eau de vie label sharing one owner.
- `IngredientChoice` gains `share?: number | null`. `ingredientLinks` (the JSON the pickers post) carries it.

### The table (one component, `IngredientShareTable`)

Used by `IngredientPickers` for Cognac, Armagnac, Pisco (grapes) and Calvados (fruit), in the label form, the Add-bottle page and the bulk editor's ingredient cell.

- **Grapes (Cognac, Armagnac, Pisco):** a row per grape: name, Share (%), remove. "+ Add a grape" with suggestions in the spirit's order. Typing a name not in the list is accepted (as today). Lists, main grapes first:
  - Cognac: Ugni Blanc, Folle Blanche, Colombard; then Montils, Folignan, Sémillon, Jurançon Blanc, Meslier St-François, Sélect.
  - Armagnac: Ugni Blanc, Baco 22A, Folle Blanche, Colombard; then Clairette de Gascogne, Plant de Graisse, Meslier Saint-François, Jurançon Blanc, Blanquette de Saint-Gaudens, Mauzac.
  - Pisco: by the distillery's country (Peru: Quebranta, Mollar, Uvina, Negra Criolla, Italia, Moscatel, Torontel, Albilla; Chile: Moscatel de Alejandría, Moscatel Rosada, Torontel, Moscatel de Austria, Pedro Jiménez). Puro or Acholado is worked out from the row count (already built).
  - The existing "Baco Blanc" suggestion stays valid for old labels; "Baco 22A" is the Armagnac name from now on.
- **Calvados fruit:** the table has six fixed rows, each with a Share box: Bittersweet, Bitter, Sweet, Acidic / tart, Apples (type not stated), Pears. An **Apples subtotal** (the four types and the unstated row) and a **Total** sit under it. A blank row is not saved.
- **Warnings** (a note under the table, never a block): the total is not 100 when at least one share is filled; Pays d'Auge with pears over 30%; Domfrontais with pears under 30%. They join the appellation notes already built (`appellationNote`).

### Save and API

- `insertIngredients` writes `share_pct`; a share on a row of a kind that has none is ignored.
- A caller that sends names only (the phone, the bulk editor's old cell) must not erase shares: when an incoming row names an ingredient the label already has, its saved share rides along (the finish-pair `carryPairs` rule). A row that is new has none.
- `GET /api/v1/expressions/:id` adds `share` to each ingredient object (additive; old builds ignore it). `PATCH` accepts an optional `share` per ingredient.
- Calvados: the fixed rows are ordinary ingredients, so the API needs nothing special; `family` stays `apple` or `pear`.

### Detail pages

A table (name, share) instead of chips for these four spirits when any share exists; chips otherwise. Calvados shows the Apples subtotal and the Pears row.

## Tasks (each its own PR; the first needs a migration run on every deployed database)

1. **Data and save:** migration 0059 (column, Calvados conversion, rollback), `IngredientChoice.share`, save, carry rule, API field, tests (opt-in database test creates and drops its own database).
2. **The grape table:** `IngredientShareTable` for Cognac, Armagnac, Pisco, with the lists, the total note, and the detail pages; bulk editor cell.
3. **The Calvados fruit table:** the fixed rows, subtotal, Total, pear warnings, detail page.

## Review focus

1. A phone edit of a Cognac label (names only) keeps every grape's share.
2. The Calvados conversion touches only Calvados labels: an apple brandy label sharing the owner's "Apple" keeps it.
3. A share entered, then the row removed, leaves no orphan share; a label with no shares behaves as today.
4. Shares that add to 99.99 or 100.01 by rounding do not warn.
5. A Pisco with a Peruvian and a Chilean distillery shows neither list's special rules.

## Left to the builder

The exact look of the table (the mashbill table is the model), the placement of the note, and the grouping of suggestions.
