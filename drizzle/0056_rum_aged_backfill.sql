-- Rum gets the Aged toggle (is_aged, which amaro and liqueur already use). A rum label that shows aging today
-- (an age, an age statement, NAS, a distilled or bottled date, a finish, or a bottle of it with an age, a barrel date
-- or a pick) is switched to aged so nothing it shows
-- disappears; every other rum label starts unaged. Idempotent: it only turns the flag on.
UPDATE expressions e
   SET is_aged = true
  FROM categories c
 WHERE c.id = e.category_id
   AND c.field_group = 'rum'
   AND NOT e.is_aged
   AND (
        e.age_years IS NOT NULL OR e.age_months IS NOT NULL OR e.age_days IS NOT NULL
        OR btrim(coalesce(e.age_statement, '')) <> ''
        OR e.is_nas
        OR e.barrel_filled_on IS NOT NULL OR e.bottled_on IS NOT NULL
        OR EXISTS (SELECT 1 FROM expression_finishes f WHERE f.expression_id = e.id)
        -- Facts only a bottle of it records: the bottle form shows them, so the label has to be aged for them to stay shown.
        OR EXISTS (
          SELECT 1 FROM bottles b
           WHERE b.expression_id = e.id
             AND (b.age_years IS NOT NULL OR b.age_months IS NOT NULL OR b.age_days IS NOT NULL
                  OR btrim(coalesce(b.age_statement, '')) <> ''
                  OR b.barrel_filled_on IS NOT NULL OR b.bottled_on IS NOT NULL
                  OR b.is_single_barrel OR b.is_single_barrel_pick
                  OR btrim(coalesce(b.pick_name, '')) <> '' OR btrim(coalesce(b.picked_by, '')) <> ''
                  OR btrim(coalesce(b.barrel_number, '')) <> '')
        )
   );
