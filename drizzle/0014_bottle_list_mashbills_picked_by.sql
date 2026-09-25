-- Bulk delete and edit for bottles and labels (grid columns): the collection
-- grid can now show Mashbill and Picked By, neither of which the view
-- exposed — pickedBy was only ever folded into search text, and mashbills
-- had no aggregate at all, unlike distilleries and finishes.
--
-- A replace cannot reorder or insert columns, only append, so the view is
-- dropped and rebuilt, same as 0003, 0004 and 0008.
DROP VIEW IF EXISTS bottle_list;

CREATE VIEW bottle_list AS
SELECT
    b.id,
    b.status,
    b.is_open,
    b.fill_pct,
    b.price_paid,
    b.date_acquired,
    b.date_opened,
    b.is_favorite,
    b.store_id,
    b.batch,
    b.release_year,
    b.is_single_barrel,
    b.is_single_barrel_pick,
    b.pick_name,
    b.picked_by,
    b.barrel_filled_on,
    b.bottled_on,
    e.id   AS expression_id,
    e.name AS expression_name,
    coalesce(b.proof, e.proof)                 AS proof,
    coalesce(b.abv, e.abv)                     AS abv,
    coalesce(b.age_years, e.age_years)         AS age_years,
    coalesce(b.age_statement, e.age_statement) AS age_statement,
    (b.proof IS NULL AND e.proof IS NOT NULL)  AS proof_inherited,
    (b.age_years IS NULL AND b.age_statement IS NULL
       AND (e.age_years IS NOT NULL OR e.age_statement IS NOT NULL))
                                               AS age_inherited,
    e.msrp,
    br.id   AS brand_id,
    br.name AS brand,
    c.id    AS category_id,
    c.name  AS category,
    c.field_group AS field_group,
    s.name  AS store,
    (SELECT string_agg(d.name, ', ' ORDER BY ed.position)
       FROM expression_distilleries ed
       JOIN distilleries d ON d.id = ed.distillery_id
      WHERE ed.expression_id = e.id) AS distilleries,
    (SELECT string_agg(coalesce(m.name::text, 'Untitled mashbill'), ', ' ORDER BY em.position)
       FROM expression_mashbills em
       JOIN mashbills m ON m.id = em.mashbill_id
      WHERE em.expression_id = e.id) AS mashbills,
    (SELECT string_agg(f.name, ', ' ORDER BY ef.position)
       FROM expression_finishes ef
       JOIN finishes f ON f.id = ef.finish_id
      WHERE ef.expression_id = e.id) AS finishes,
    (SELECT round(avg(tn.rating), 1)
       FROM tasting_notes tn WHERE tn.bottle_id = b.id) AS avg_rating,
    (SELECT bi.thumb_path FROM bottle_images bi
      WHERE bi.bottle_id = b.id
      ORDER BY bi.is_primary DESC, bi.sort_order, bi.id
      LIMIT 1) AS thumb_path,
    (
      setweight(to_tsvector('english', coalesce(br.name::text, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(e.name::text, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(b.batch, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(b.pick_name, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(b.picked_by, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(b.age_statement, e.age_statement, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(c.name::text, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(s.name::text, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(
        (SELECT string_agg(d.name::text, ' ')
           FROM expression_distilleries ed
           JOIN distilleries d ON d.id = ed.distillery_id
          WHERE ed.expression_id = e.id), '')), 'B') ||
      setweight(to_tsvector('english', coalesce(
        (SELECT string_agg(f.name::text, ' ')
           FROM expression_finishes ef
           JOIN finishes f ON f.id = ef.finish_id
          WHERE ef.expression_id = e.id), '')), 'B') ||
      setweight(to_tsvector('english', coalesce(e.description, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(b.notes, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(
        (SELECT string_agg(
            concat_ws(' ', tn.nose, tn.palate, tn.finish, tn.overall), ' ')
           FROM tasting_notes tn WHERE tn.bottle_id = b.id), '')), 'C')
    ) AS search,
    concat_ws(' ',
      br.name::text, e.name::text, b.batch, b.pick_name, b.picked_by,
      coalesce(b.age_statement, e.age_statement), c.name::text, s.name::text,
      (SELECT string_agg(d.name::text, ' ')
         FROM expression_distilleries ed
         JOIN distilleries d ON d.id = ed.distillery_id
        WHERE ed.expression_id = e.id),
      (SELECT string_agg(f.name::text, ' ')
         FROM expression_finishes ef
         JOIN finishes f ON f.id = ef.finish_id
        WHERE ef.expression_id = e.id),
      e.description, b.notes,
      (SELECT string_agg(concat_ws(' ', tn.nose, tn.palate, tn.finish, tn.overall), ' ')
         FROM tasting_notes tn WHERE tn.bottle_id = b.id)
    ) AS search_text
FROM bottles b
JOIN expressions  e  ON e.id  = b.expression_id
JOIN brands       br ON br.id = e.brand_id
JOIN categories   c  ON c.id  = e.category_id
LEFT JOIN stores  s  ON s.id  = b.store_id;
