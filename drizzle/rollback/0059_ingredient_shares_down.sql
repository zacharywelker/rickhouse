-- Undoes drizzle/0059_ingredient_shares.sql. Not run by the migrator; run by hand after a backup.
-- Puts the Calvados fruit rows back as the plain tags they were converted from ("Apple", "Pear"; a Cider Apple or a Williams Pear
-- was already merged into them and cannot be told apart), on Calvados labels only: another label (an eau de vie) that uses the
-- owner's "Pears" or "Apples (type not stated)" keeps it. Then drops the share column and what was entered in it.
INSERT INTO ingredients (owner_id, kind, name, family)
SELECT DISTINCT e.owner_id, 'distillate', CASE i.family WHEN 'apple' THEN 'Apple' ELSE 'Pear' END, i.family
  FROM expression_ingredients ei
  JOIN ingredients i ON i.id = ei.ingredient_id AND i.kind = 'distillate' AND i.name IN ('Apples (type not stated)', 'Pears')
  JOIN expressions e ON e.id = ei.expression_id
  JOIN categories c ON c.id = e.category_id
  LEFT JOIN categories p ON p.id = c.parent_id
 WHERE c.slug = 'calvados' OR p.slug = 'calvados'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO expression_ingredients (expression_id, ingredient_id, position, is_manual)
SELECT ei.expression_id, t.id, ei.position, ei.is_manual
  FROM expression_ingredients ei
  JOIN ingredients i ON i.id = ei.ingredient_id AND i.kind = 'distillate' AND i.name IN ('Apples (type not stated)', 'Pears')
  JOIN expressions e ON e.id = ei.expression_id
  JOIN categories c ON c.id = e.category_id
  LEFT JOIN categories p ON p.id = c.parent_id
  JOIN ingredients t ON t.owner_id = e.owner_id AND t.kind = 'distillate' AND t.name = CASE i.family WHEN 'apple' THEN 'Apple' ELSE 'Pear' END
 WHERE c.slug = 'calvados' OR p.slug = 'calvados'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM expression_ingredients ei
 USING ingredients i, expressions e, categories c
  LEFT JOIN categories p ON p.id = c.parent_id
 WHERE i.id = ei.ingredient_id AND i.kind = 'distillate' AND i.name IN ('Apples (type not stated)', 'Pears')
   AND e.id = ei.expression_id AND c.id = e.category_id
   AND (c.slug = 'calvados' OR p.slug = 'calvados');
--> statement-breakpoint
ALTER TABLE expression_ingredients DROP CONSTRAINT IF EXISTS expression_ingredients_share_check, DROP COLUMN IF EXISTS share_pct;
