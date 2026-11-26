-- A share for each ingredient of a label (design: docs/superpowers/specs/2026-11-25-ingredient-shares-design.md): the grapes of
-- a Cognac, Armagnac or pisco and the fruit of a Calvados are a table of name and share. Optional: null means not stated.
ALTER TABLE expression_ingredients
  ADD COLUMN share_pct numeric(5,2) CONSTRAINT expression_ingredients_share_check CHECK (share_pct IS NULL OR share_pct BETWEEN 0 AND 100);
--> statement-breakpoint
-- Calvados fruit is six fixed rows (Bittersweet, Bitter, Sweet, Acidic / tart, Apples (type not stated), Pears). The plain tags
-- a Calvados label has today become the last two: any apple tag the "type not stated" row, any pear tag Pears. Only Calvados
-- labels are touched: apple brandy and eau de vie labels share the owner's "Apple" and "Pear" tags and keep them.
INSERT INTO ingredients (owner_id, kind, name, family)
SELECT DISTINCT e.owner_id, 'distillate', CASE i.family WHEN 'apple' THEN 'Apples (type not stated)' ELSE 'Pears' END, i.family
  FROM expression_ingredients ei
  JOIN ingredients i ON i.id = ei.ingredient_id AND i.kind = 'distillate' AND i.family IN ('apple', 'pear')
  JOIN expressions e ON e.id = ei.expression_id
  JOIN categories c ON c.id = e.category_id
  LEFT JOIN categories p ON p.id = c.parent_id
 WHERE c.slug = 'calvados' OR p.slug = 'calvados'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO expression_ingredients (expression_id, ingredient_id, position, is_manual)
SELECT ei.expression_id, t.id, ei.position, ei.is_manual
  FROM expression_ingredients ei
  JOIN ingredients i ON i.id = ei.ingredient_id AND i.kind = 'distillate' AND i.family IN ('apple', 'pear')
  JOIN expressions e ON e.id = ei.expression_id
  JOIN categories c ON c.id = e.category_id
  LEFT JOIN categories p ON p.id = c.parent_id
  JOIN ingredients t ON t.owner_id = e.owner_id AND t.kind = 'distillate' AND t.name = CASE i.family WHEN 'apple' THEN 'Apples (type not stated)' ELSE 'Pears' END
 WHERE (c.slug = 'calvados' OR p.slug = 'calvados') AND i.name NOT IN ('Apples (type not stated)', 'Pears')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM expression_ingredients ei
 USING ingredients i, expressions e, categories c
  LEFT JOIN categories p ON p.id = c.parent_id
 WHERE i.id = ei.ingredient_id AND i.kind = 'distillate' AND i.family IN ('apple', 'pear')
   AND i.name NOT IN ('Apples (type not stated)', 'Pears')
   AND e.id = ei.expression_id AND c.id = e.category_id
   AND (c.slug = 'calvados' OR p.slug = 'calvados');
