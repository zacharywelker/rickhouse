UPDATE categories SET name = 'Scotch Whisky' WHERE slug = 'scotch';
--> statement-breakpoint
UPDATE categories SET name = 'Single Malt Scotch Whisky' WHERE slug = 'single-malt-scotch';
--> statement-breakpoint
UPDATE categories SET name = 'Blended Scotch Whisky' WHERE slug = 'blended-scotch';
--> statement-breakpoint
UPDATE categories SET name = 'American Single Malt' WHERE slug = 'american-single-malt';
--> statement-breakpoint
INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
VALUES ('Amaro', 'amaro', NULL, 'amaro', 7), ('Liqueur', 'liqueur', NULL, 'liqueur', 8)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
SELECT child.name, child.slug, parent.id, child.field_group, child.sort_order
FROM (VALUES
  ('Flavored Vodka', 'flavored-vodka', 'vodka', 'vodka', 1),
  ('Canadian Whisky', 'canadian-whisky', 'whiskey', 'whiskey', 4),
  ('Pot Still Irish Whiskey', 'pot-still-irish-whiskey', 'irish-whiskey', 'whiskey', 1),
  ('Malt Irish Whiskey', 'malt-irish-whiskey', 'irish-whiskey', 'whiskey', 2),
  ('Grain Irish Whiskey', 'grain-irish-whiskey', 'irish-whiskey', 'whiskey', 3),
  ('Blended Irish Whiskey', 'blended-irish-whiskey', 'irish-whiskey', 'whiskey', 4),
  ('Single Grain Scotch Whisky', 'single-grain-scotch', 'scotch', 'whiskey', 2),
  ('Blended Grain Scotch Whisky', 'blended-grain-scotch', 'scotch', 'whiskey', 4),
  ('Blended Malt Scotch Whisky', 'blended-malt-scotch', 'scotch', 'whiskey', 5),
  ('Corn Whiskey', 'corn-whiskey', 'american-whiskey', 'whiskey', 4),
  ('Herbal Liqueur', 'herbal-liqueur', 'liqueur', 'liqueur', 1),
  ('Nut Liqueur', 'nut-liqueur', 'liqueur', 'liqueur', 2),
  ('Chocolate Liqueur', 'chocolate-liqueur', 'liqueur', 'liqueur', 3),
  ('Coffee Liqueur', 'coffee-liqueur', 'liqueur', 'liqueur', 4),
  ('Cream Liqueur', 'cream-liqueur', 'liqueur', 'liqueur', 5),
  ('Anise Liqueur', 'anise-liqueur', 'liqueur', 'liqueur', 6),
  ('Fruit Liqueur', 'fruit-liqueur', 'liqueur', 'liqueur', 7)
) AS child(name, slug, parent_slug, field_group, sort_order)
JOIN categories parent ON parent.slug = child.parent_slug
ON CONFLICT (slug) DO NOTHING;
