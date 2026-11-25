-- Undoes drizzle/0055_category_tree.sql. Not run by the migrator; run by hand after a backup.
--
-- Puts American Whiskey, Scotch Whisky and Irish Whiskey back under the old Whiskey row and renames it, then removes
-- the rows the migration added, but ONLY if no label uses them (it raises instead). Saved smart groups that the migration
-- extended keep the three extra ids: they are harmless (a category filter on a category that is again under Whiskey
-- matches the same bottles).
DO $$
DECLARE
  used integer;
BEGIN
  SELECT count(*) INTO used
    FROM expressions e
    WHERE e.category_id IN (SELECT category_id FROM category_migration_0055_added);
  IF used > 0 THEN
    RAISE EXCEPTION 'Cannot roll back: % label(s) use a category the migration added. Move them first.', used;
  END IF;
END $$;
--> statement-breakpoint
UPDATE categories SET parent_id = (SELECT id FROM categories WHERE slug = 'whiskey')
 WHERE slug IN ('american-whiskey', 'scotch', 'irish-whiskey');
--> statement-breakpoint
UPDATE categories SET name = 'Whiskey' WHERE slug = 'whiskey';
--> statement-breakpoint
-- Only the rows the migration itself added (it recorded their ids), so a category an admin made before the migration,
-- even with the same slug and name as one of ours, stays. A row that still has a child is not deleted, because
-- categories.parent_id is ON DELETE SET NULL and would orphan the child. The delete runs twice: the first pass removes
-- Absinthe, Akvavit and Shochu, which leaves Other childless for the second.
DELETE FROM categories
 WHERE id IN (SELECT category_id FROM category_migration_0055_added)
   AND NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = categories.id);
--> statement-breakpoint
DELETE FROM categories
 WHERE id IN (SELECT category_id FROM category_migration_0055_added)
   AND NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = categories.id);
--> statement-breakpoint
DROP TABLE IF EXISTS category_migration_0055_added;
--> statement-breakpoint
-- The sort order the seed made before the redesign.
UPDATE categories c SET sort_order = v.sort_order
FROM (VALUES
  ('whiskey', 1), ('rum', 2), ('agave', 3), ('brandy', 4), ('gin', 5), ('vodka', 6), ('amaro', 7), ('liqueur', 8),
  ('american-whiskey', 1), ('scotch', 2), ('irish-whiskey', 3), ('canadian-whisky', 4),
  ('herbal-liqueur', 1), ('nut-liqueur', 2), ('chocolate-liqueur', 3), ('coffee-liqueur', 4), ('cream-liqueur', 5),
  ('anise-liqueur', 6), ('fruit-liqueur', 7)
) AS v(slug, sort_order)
WHERE c.slug = v.slug;
