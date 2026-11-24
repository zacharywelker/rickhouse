-- The category tree of the add-bottle redesign (design record, section 5).
--
-- Every existing row keeps its id and slug, so no label or bottle is re-pointed: this moves three rows to the top
-- level, renames the old top row, adds rows, sets the sort order and rewrites saved smart groups. The tree steps are safe
-- to run twice (the smart-group step would add the three ids again to a group that lists only Whisky, so run it once,
-- as the migrator does), and it does nothing harmful on an empty table (a fresh install: the seed builds the tree from src/lib/categories/tree.ts).
-- `ON CONFLICT DO NOTHING` has no target on purpose: an admin-made category with the same name under the same parent
-- must not stop the migration, it just means that row is not added.

-- American Whiskey, Scotch Whisky and Irish Whiskey become top-level categories.
UPDATE categories SET parent_id = NULL WHERE slug IN ('american-whiskey', 'scotch', 'irish-whiskey');
--> statement-breakpoint
-- The old umbrella keeps its id and slug and is now "Whisky": Canadian plus the new international rows.
UPDATE categories SET name = 'Whisky' WHERE slug = 'whiskey';
--> statement-breakpoint
INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
VALUES ('Other', 'other', NULL, 'other', 12)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
SELECT child.name, child.slug, parent.id, child.field_group, child.sort_order
FROM (VALUES
  ('Tennessee', 'tennessee', 'american-whiskey', 'whiskey', 7),
  ('Japanese Whisky', 'japanese', 'whiskey', 'whiskey', 2),
  ('Other International Whisky', 'international', 'whiskey', 'whiskey', 3),
  ('Flavored Whisky', 'flavored-whisky', 'whiskey', 'whiskey', 4),
  ('Cachaça', 'cachaca', 'rum', 'rum', 1),
  ('Rhum Agricole', 'agricole', 'rum', 'rum', 2),
  ('Flavored / Spiced Rum', 'spiced-rum', 'rum', 'rum', 3),
  ('Apple Brandy', 'apple', 'brandy', 'brandy', 5),
  ('Eau de Vie', 'eau-de-vie', 'brandy', 'brandy', 6),
  ('Absinthe', 'absinthe', 'other', 'other', 1),
  ('Akvavit', 'akvavit', 'other', 'other', 2),
  ('Shochu', 'shochu', 'other', 'other', 3)
) AS child(name, slug, parent_slug, field_group, sort_order)
JOIN categories parent ON parent.slug = child.parent_slug AND (child.parent_slug <> 'other' OR parent.parent_id IS NULL)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Sort order, as in src/lib/categories/tree.ts.
UPDATE categories c SET sort_order = v.sort_order
FROM (VALUES
  ('american-whiskey', 1), ('irish-whiskey', 2), ('scotch', 3), ('whiskey', 4), ('rum', 5), ('agave', 6),
  ('brandy', 7), ('gin', 8), ('vodka', 9), ('amaro', 10), ('liqueur', 11), ('other', 12),
  ('bourbon', 1), ('rye', 2), ('wheat-whiskey', 3), ('corn-whiskey', 4), ('american-single-malt', 5),
  ('light-whiskey', 6), ('tennessee', 7),
  ('pot-still-irish-whiskey', 1), ('malt-irish-whiskey', 2), ('grain-irish-whiskey', 3), ('blended-irish-whiskey', 4),
  ('single-malt-scotch', 1), ('single-grain-scotch', 2), ('blended-scotch', 3), ('blended-grain-scotch', 4),
  ('blended-malt-scotch', 5),
  ('canadian-whisky', 1), ('japanese', 2), ('international', 3), ('flavored-whisky', 4),
  ('cachaca', 1), ('agricole', 2), ('spiced-rum', 3),
  ('tequila', 1), ('mezcal', 2),
  ('cognac', 1), ('armagnac', 2), ('calvados', 3), ('pisco', 4), ('apple', 5), ('eau-de-vie', 6),
  ('genever', 1), ('flavored-vodka', 1),
  ('fruit-liqueur', 1), ('anise-liqueur', 2), ('cream-liqueur', 3), ('nut-liqueur', 4), ('herbal-liqueur', 5),
  ('chocolate-liqueur', 6), ('coffee-liqueur', 7),
  ('absinthe', 1), ('akvavit', 2), ('shochu', 3)
) AS v(slug, sort_order)
WHERE c.slug = v.slug;
--> statement-breakpoint
-- A saved smart group stores the Collection's filters as a query string, written by serialiseFilters, which percent-encodes
-- the comma: "category=12%2C40&store=3". A category filter matches the category and everything under it. The old Whiskey
-- row used to hold American, Scotch and Irish, so a group that listed it also lists the three rows that moved out, and
-- keeps matching the same bottles. Both "%2C" and a literal comma are read; the list is written back with "%2C", as the
-- app writes it.
DO $$
DECLARE
  umbrella integer;
  moved text[];
  r record;
  m text[];
  ids text[];
  x text;
BEGIN
  SELECT id INTO umbrella FROM categories WHERE slug = 'whiskey';
  SELECT array_agg(id::text ORDER BY id) INTO moved FROM categories WHERE slug IN ('american-whiskey', 'scotch', 'irish-whiskey');
  IF umbrella IS NULL OR moved IS NULL THEN
    RETURN;
  END IF;
  FOR r IN SELECT id, filter_query FROM groups WHERE filter_query ~ '(^|&)category=[0-9]' LOOP
    m := regexp_match(r.filter_query, '(^|&)category=([0-9]+(?:(?:,|%2[Cc])[0-9]+)*)');
    IF m IS NULL THEN
      CONTINUE;
    END IF;
    ids := regexp_split_to_array(m[2], ',|%2[Cc]');
    IF umbrella::text = ANY (ids) THEN
      FOREACH x IN ARRAY moved LOOP
        IF NOT (x = ANY (ids)) THEN
          ids := ids || x;
        END IF;
      END LOOP;
      UPDATE groups
         SET filter_query = regexp_replace(filter_query, '(^|&)category=[0-9]+(?:(?:,|%2[Cc])[0-9]+)*', '\1category=' || array_to_string(ids, '%2C'))
       WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
