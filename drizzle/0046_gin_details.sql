INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
SELECT 'Genever', 'genever', parent.id, 'gin', 1
FROM categories parent WHERE parent.slug = 'gin'
  AND NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'genever')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
ALTER TABLE ingredients DROP CONSTRAINT ingredients_kind_check;
--> statement-breakpoint
ALTER TABLE ingredients ADD CONSTRAINT ingredients_kind_check CHECK (kind IN ('maguey', 'distillate', 'rum_base', 'botanical', 'gin_base'));
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN gin_style text;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN is_aged_gin boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE bottles ADD COLUMN gin_is_nas boolean;
--> statement-breakpoint
UPDATE expressions e SET is_aged_gin = true
FROM categories c
WHERE e.category_id = c.id AND c.field_group = 'gin'
  AND (e.age_years IS NOT NULL OR e.age_months IS NOT NULL OR e.age_days IS NOT NULL
    OR e.is_nas OR nullif(trim(e.age_statement), '') IS NOT NULL
    OR EXISTS (SELECT 1 FROM expression_finishes ef WHERE ef.expression_id = e.id));
--> statement-breakpoint
INSERT INTO ingredients (owner_id, kind, name)
SELECT DISTINCT e.owner_id, 'botanical', 'Juniper' FROM expressions e
JOIN categories c ON c.id = e.category_id AND c.field_group = 'gin'
ON CONFLICT (owner_id, kind, name) DO NOTHING;
--> statement-breakpoint
INSERT INTO expression_ingredients (expression_id, ingredient_id, position)
SELECT e.id, i.id, -1 FROM expressions e
JOIN categories c ON c.id = e.category_id AND c.field_group = 'gin'
JOIN ingredients i ON i.owner_id = e.owner_id AND i.kind = 'botanical' AND i.name = 'Juniper'
ON CONFLICT DO NOTHING;
