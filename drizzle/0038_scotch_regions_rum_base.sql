-- Scotch gets two categories and regions: a label names the regions its whisky comes from (several for a
-- blend), and a distillery names its own, which a label copies when the distillery is linked.
ALTER TABLE "distilleries" ADD COLUMN "region" text;
--> statement-breakpoint
ALTER TABLE "expressions" ADD COLUMN "regions" text[];
--> statement-breakpoint
-- Rum's base is one of molasses, sugarcane, honey or other; "cane juice" is now "sugarcane".
UPDATE "expressions" SET "molasses_or_cane" = 'sugarcane' WHERE "molasses_or_cane" = 'cane juice';
--> statement-breakpoint
-- Labels already filed under plain Scotch stay there until they are sorted into one of the two.
INSERT INTO "categories" ("name", "slug", "parent_id", "field_group", "sort_order")
SELECT v.name, v.slug, (SELECT id FROM categories WHERE slug = 'scotch'), 'whiskey', v.ord
FROM (VALUES ('Single Malt Scotch', 'single-malt-scotch', 1), ('Blended Scotch', 'blended-scotch', 2)) AS v(name, slug, ord)
WHERE EXISTS (SELECT 1 FROM categories WHERE slug = 'scotch')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
-- Gin and vodka are categories from the start; an account that already made its own keeps it.
INSERT INTO "categories" ("name", "slug", "parent_id", "field_group", "sort_order")
SELECT v.name, v.slug, NULL, v.fg, v.ord
FROM (VALUES ('Gin', 'gin', 'gin', 5), ('Vodka', 'vodka', 'vodka', 6)) AS v(name, slug, fg, ord)
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.slug = v.slug OR (c.name = v.name AND c.parent_id IS NULL))
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
-- A bottle can be a different size from its label's; null means the label's.
ALTER TABLE "bottles" ADD COLUMN "size_ml" integer;
