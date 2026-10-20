-- Named subcategories drive the fields and legal age guidance.
INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
SELECT v.name, v.slug, parent.id, v.field_group, v.sort_order
FROM (VALUES
  ('Tequila', 'tequila', 'agave', 'agave', 1),
  ('Mezcal', 'mezcal', 'agave', 'agave', 2),
  ('Cognac', 'cognac', 'brandy', 'brandy', 1),
  ('Armagnac', 'armagnac', 'brandy', 'brandy', 2),
  ('Calvados', 'calvados', 'brandy', 'brandy', 3),
  ('Pisco', 'pisco', 'brandy', 'brandy', 4)
) AS v(name, slug, parent_slug, field_group, sort_order)
JOIN categories parent ON parent.slug = v.parent_slug
WHERE NOT EXISTS (
  SELECT 1 FROM categories existing WHERE existing.slug = v.slug OR (existing.name = v.name AND existing.parent_id = parent.id)
)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
ALTER TABLE distilleries ADD COLUMN nom_number text;
--> statement-breakpoint
UPDATE distilleries SET nom_number = dsp_number, dsp_number = NULL
WHERE lower(trim(country)) IN ('mx', 'mexico', 'méxico') AND dsp_number IS NOT NULL;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN tequila_class text;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN brandy_grade text;
--> statement-breakpoint
ALTER TABLE bottles ADD COLUMN tequila_class text;
--> statement-breakpoint
ALTER TABLE bottles ADD COLUMN brandy_grade text;
--> statement-breakpoint
CREATE TABLE ingredients (
  id serial PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('maguey', 'distillate', 'rum_base')),
  name citext NOT NULL,
  family text CHECK (family IS NULL OR family IN ('grape', 'apple', 'pear', 'other')),
  CONSTRAINT ingredients_id_owner_unique UNIQUE (id, owner_id),
  CONSTRAINT ingredients_owner_kind_name_unique UNIQUE (owner_id, kind, name)
);
--> statement-breakpoint
CREATE INDEX ingredients_owner_idx ON ingredients(owner_id);
--> statement-breakpoint
CREATE TABLE expression_ingredients (
  expression_id integer NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  ingredient_id integer NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (expression_id, ingredient_id)
);
--> statement-breakpoint
CREATE TRIGGER expression_ingredients_same_owner BEFORE INSERT OR UPDATE ON expression_ingredients
FOR EACH ROW EXECUTE FUNCTION assert_same_owner('expression_id', 'expressions', 'ingredient_id', 'ingredients');
--> statement-breakpoint
-- Keep old rum and agave facts available through the new reusable pickers.
INSERT INTO ingredients (owner_id, kind, name)
SELECT DISTINCT owner_id, 'rum_base', trim(molasses_or_cane)::citext FROM expressions
WHERE molasses_or_cane IS NOT NULL AND trim(molasses_or_cane) <> ''
ON CONFLICT (owner_id, kind, name) DO NOTHING;
--> statement-breakpoint
INSERT INTO expression_ingredients (expression_id, ingredient_id, position)
SELECT e.id, i.id, 0 FROM expressions e
JOIN ingredients i ON i.owner_id = e.owner_id AND i.kind = 'rum_base' AND i.name = trim(e.molasses_or_cane)::citext
WHERE e.molasses_or_cane IS NOT NULL AND trim(e.molasses_or_cane) <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (owner_id, kind, name)
SELECT DISTINCT e.owner_id, 'maguey', trim(part.name)::citext FROM expressions e
CROSS JOIN LATERAL regexp_split_to_table(e.agave_type, ',') AS part(name)
WHERE e.agave_type IS NOT NULL AND trim(part.name) <> ''
ON CONFLICT (owner_id, kind, name) DO NOTHING;
--> statement-breakpoint
INSERT INTO expression_ingredients (expression_id, ingredient_id, position)
SELECT e.id, i.id, part.position::integer - 1 FROM expressions e
CROSS JOIN LATERAL regexp_split_to_table(e.agave_type, ',') WITH ORDINALITY AS part(name, position)
JOIN ingredients i ON i.owner_id = e.owner_id AND i.kind = 'maguey' AND i.name = trim(part.name)::citext
WHERE e.agave_type IS NOT NULL AND trim(part.name) <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- A tequila label always uses the fixed Blue Weber choice, including older labels.
INSERT INTO ingredients (owner_id, kind, name)
SELECT DISTINCT e.owner_id, 'maguey', 'Blue Weber' FROM expressions e
JOIN categories c ON c.id = e.category_id AND c.slug = 'tequila'
ON CONFLICT (owner_id, kind, name) DO NOTHING;
--> statement-breakpoint
DELETE FROM expression_ingredients ei USING expressions e, categories c
WHERE ei.expression_id = e.id AND e.category_id = c.id AND c.slug = 'tequila';
--> statement-breakpoint
INSERT INTO expression_ingredients (expression_id, ingredient_id, position)
SELECT e.id, i.id, 0 FROM expressions e
JOIN categories c ON c.id = e.category_id AND c.slug = 'tequila'
JOIN ingredients i ON i.owner_id = e.owner_id AND i.kind = 'maguey' AND i.name = 'Blue Weber'
ON CONFLICT DO NOTHING;
