-- The grid filters by entity, not by name: picking "Bardstown Bourbon Company"
-- has to match every blend it contributed to, which means matching on ids
-- through the join tables rather than on the aggregated name string.
--
-- The view keeps its flattened name columns for display and gains the ids the
-- filters need, plus age_years and is_favorite for the range and toggle
-- filters.
-- A replace cannot reorder or insert columns, only append, so the view is
-- dropped and rebuilt.
DROP VIEW IF EXISTS bottle_list;
--> statement-breakpoint
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
    e.id   AS expression_id,
    e.name AS expression_name,
    e.batch,
    e.proof,
    e.abv,
    e.age_years,
    e.age_statement,
    e.msrp,
    e.is_single_barrel,
    e.is_single_barrel_pick,
    br.id   AS brand_id,
    br.name AS brand,
    c.id    AS category_id,
    c.name  AS category,
    s.name  AS store,
    (SELECT string_agg(d.name, ', ' ORDER BY ed.position)
       FROM expression_distilleries ed
       JOIN distilleries d ON d.id = ed.distillery_id
      WHERE ed.expression_id = e.id) AS distilleries,
    (SELECT string_agg(f.name, ', ' ORDER BY ef.position)
       FROM expression_finishes ef
       JOIN finishes f ON f.id = ef.finish_id
      WHERE ef.expression_id = e.id) AS finishes,
    (SELECT round(avg(tn.rating), 1)
       FROM tasting_notes tn WHERE tn.bottle_id = b.id) AS avg_rating,
    (SELECT bi.thumb_path FROM bottle_images bi
      WHERE bi.bottle_id = b.id
      ORDER BY bi.is_primary DESC, bi.sort_order, bi.id
      LIMIT 1) AS thumb_path
FROM bottles b
JOIN expressions  e  ON e.id  = b.expression_id
JOIN brands       br ON br.id = e.brand_id
JOIN categories   c  ON c.id  = e.category_id
LEFT JOIN stores  s  ON s.id  = b.store_id;
