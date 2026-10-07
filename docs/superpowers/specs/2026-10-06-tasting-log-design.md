# Tasting log (M9): design

Status: decided in conversation on 2026-10-06; nothing is built yet.
Builds on `SPEC.md` M9 ("Tastings beyond the shelf") and section 11.4 and 11.5 of
`2026-10-05-design-language-design.md`. Where this file and M9 disagree, this file is newer.

## 1. What is decided

| Question | Decision |
| --- | --- |
| What does a tasting belong to? | A label (expression), always. A bottle is optional. (M9, unchanged) |
| Where is the tasting from? | A **source**: owned, bar, bottle share, sample, store pour. Picking one of your own bottles sets *owned* automatically. |
| Where was it drunk? | **Tasted at**, free text (a bar, a friend's kitchen). Optional. |
| How is it written? | One flat set of **flavor tags**, plus optional free text. Nose, palate, finish and overall stay as optional text, as today. |
| Which tags? | A fixed list **per spirit family**, the eight families the label form already uses: whiskey, rum, agave, brandy, gin, vodka, liqueur, other. Lists in section 5. |
| Rating | Unchanged: 0 to 10 in half steps, optional. Nothing is converted. |
| Searching | The Labels tab searches labels only (decided with the tab). Searching inside tasting text is not part of this. |

## 2. Data model

One migration, written by hand (drizzle-kit generate does not work here), with its journal entry.

`tasting_notes` gains:

- `owner_id`, not null, backfilled from the note's bottle. A note with no bottle still has an owner.
- `expression_id`, not null, backfilled from the note's bottle. Foreign key to the owner's own label, following the existing `(ref, owner_id)` composite-key pattern so a note cannot point at another account's label.
- `source` text, not null, default `owned`, checked against the five values. Existing notes become `owned`.
- `tasted_at` text, nullable.
- `tags` text array, not null, default empty. Holds tag keys.

`bottle_id` becomes nullable. A note's bottle must be a bottle of the note's label: a composite key if the schema can carry one, otherwise a check in the write path (to be settled when the migration is written).

**Decision to confirm before merging the migration:** deleting a bottle currently deletes its notes (`ON DELETE CASCADE`). With label-level notes that destroys history you may want to keep. The default here is **no change** (cascade stays), so the migration does not alter behavior. Switching to `ON DELETE SET NULL (bottle_id)` is possible on Postgres 16 and would keep the note on its label.

Nothing already recorded moves: every existing note gets its label, owner and `owned` source from its bottle.

## 3. Server

- The queries that find notes through the bottle (`tastingNotesForLabel`, `queryTastings`, the label page) read the note's own `expression_id`, with the bottle optional, so unowned pours appear on the label page and in the history.
- The bottle-scoped note routes keep working and fill in the new columns (label from the bottle, source `owned`).
- New: `POST /api/v1/tastings` (`expressionId`, optional `bottleId`, `source`, `tastedAt`, `tastedOn`, `rating`, `tags`, and the text fields), `PATCH` and `DELETE /api/v1/tastings/:id`.
- `GET /api/v1/tastings` and the label route return `source`, `tastedAt`, `tags` and a nullable `bottleId`.
- New: `GET /api/v1/tasting-tags` returns the lists by family; the categories route returns each category's family so the app knows which list to show.
- Tags are validated against the family's list on write. A tag later removed from a list is still shown from what is stored.

## 4. The phone flow (Log a tasting)

1. **Find the label.** The same screen as Add a bottle: a name search and a scan button, with the typed-code fallback. A scan that finds nothing, and the "no label found" case, work as they do there (an unknown label can be started on the spot).
2. **Which bottle?** Shown only when you own bottles of that label: each of them, plus "Not from my collection". Choosing a bottle sets the source to *owned*.
3. **The tasting**, quick first:
   - Source (only when no bottle was chosen), and *tasted at* beside it for the non-owned sources.
   - Date, today by default.
   - Rating, 0 to 10 in half steps, optional.
   - Flavor tags for the label's family, tapped from a grid.
   - Notes: one free-text box, with "More" for nose, palate and finish.
4. **Save** closes the sheet; the Labels tab history picks it up.

Editing an existing note uses the same form, with tags.

## 5. Draft tag lists (for review and editing)

The lists are the content of this milestone and should be edited by someone who drinks the stuff. Keys are the lowercase words; labels are the words as shown.

- **whiskey:** caramel, vanilla, toffee, honey, brown sugar, maple, oak, charred oak, toasted nuts, almond, peanut, cinnamon, baking spice, clove, pepper, mint, tobacco, leather, cherry, dried fruit, apple, orange peel, citrus, banana, chocolate, coffee, corn, rye bread, malt, smoke, peat, brine, floral, grassy
- **rum:** molasses, brown sugar, caramel, vanilla, banana, tropical fruit, pineapple, coconut, dried fruit, raisin, orange peel, oak, cinnamon, clove, pepper, coffee, chocolate, tobacco, leather, funk, grassy, sugarcane, brine, smoke, nutty
- **agave:** cooked agave, citrus, lime, grapefruit, black pepper, herbal, mint, vegetal, earthy, mineral, smoke, brine, olive, vanilla, caramel, oak, butter, tropical fruit, floral, cinnamon
- **brandy:** grape, apple, pear, apricot, peach, dried fruit, raisin, fig, citrus, floral, honey, vanilla, caramel, oak, cinnamon, spice, nutty, almond, chocolate, tobacco, leather
- **gin:** juniper, citrus, lemon peel, orange peel, grapefruit, coriander, cardamom, angelica, orris, licorice, pine, floral, lavender, rose, cucumber, herbal, pepper, cinnamon, mint, earthy, sweet
- **vodka:** clean, neutral, creamy, oily, sweet, grain, bread, earthy, citrus, mineral, peppery, heat
- **liqueur:** sweet, bitter, citrus, orange, herbal, medicinal, floral, coffee, chocolate, cream, nutty, almond, vanilla, caramel, cherry, berry, spice, mint, anise, honey, gentian, rhubarb
- **other:** sweet, bitter, citrus, fruit, floral, herbal, spice, oak, smoke, nutty, vanilla, caramel, earthy

## 6. Order of work

1. The migration, the server model and routes, the tag lists and their tests (one PR).
2. The web: the note form on a bottle gains tags, source and tasted-at; the label page shows unowned pours. (May follow the phone.)
3. The phone: Log a tasting, the shared note form with tags, and the new fields in the Labels tab and label page.

Tonight's flavors step (at least 25 tastings overall, gated per spirit) reads these tags and is a later milestone.

## 7. Not decided here

- Whether a bottle delete keeps its notes (section 2).
- The tag lists' final content (section 5).
- A web tastings timeline page.
- Searching inside tasting text.
