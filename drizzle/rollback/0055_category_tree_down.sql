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
DELETE FROM categories
 WHERE slug IN ('tennessee', 'japanese', 'international', 'flavored-whisky', 'cachaca', 'agricole', 'spiced-rum',
                'apple', 'eau-de-vie', 'absinthe', 'akvavit', 'shochu');
--> statement-breakpoint
DELETE FROM categories WHERE slug = 'other';
