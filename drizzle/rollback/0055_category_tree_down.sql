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
    JOIN categories c ON c.id = e.category_id
   WHERE c.slug IN ('tennessee', 'japanese', 'international', 'flavored-whisky', 'cachaca', 'agricole', 'spiced-rum',
                    'apple', 'eau-de-vie', 'absinthe', 'akvavit', 'shochu', 'other');
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
-- Only rows with the names the migration gave them, so an admin-made row with the same slug and another name stays.
DELETE FROM categories
 WHERE (slug, name) IN (
   ('tennessee', 'Tennessee'), ('japanese', 'Japanese Whisky'), ('international', 'Other International Whisky'),
   ('flavored-whisky', 'Flavored Whisky'), ('cachaca', 'Cachaça'), ('agricole', 'Rhum Agricole'),
   ('spiced-rum', 'Flavored / Spiced Rum'), ('apple', 'Apple Brandy'), ('eau-de-vie', 'Eau de Vie'),
   ('absinthe', 'Absinthe'), ('akvavit', 'Akvavit'), ('shochu', 'Shochu'));
--> statement-breakpoint
DELETE FROM categories WHERE slug = 'other' AND name = 'Other' AND parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.parent_id = categories.id);
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
