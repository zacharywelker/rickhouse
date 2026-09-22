-- Full-text search over the grid (SPEC M6).
--
-- A drop and recreate rather than CREATE OR REPLACE: replacing a view can only
-- append columns, and `search` has to sit alongside the existing ones rather
-- than force a reorder. Same lesson as 0003.
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
      LIMIT 1) AS thumb_path,
    -- Full-text search (SPEC M6), weighted: the name of the thing beats what
    -- someone wrote about it. Built in the view rather than kept as a stored
    -- column because it draws on six tables — a generated column cannot see
    -- past its own row, and a trigger-maintained copy across brands,
    -- expressions, distilleries, stores, bottles and tasting_notes is six
    -- ways to go stale. A view means it is never wrong.
    --
    -- The cost is that it cannot be indexed, so this is a sequential scan. At
    -- a home collection's scale (hundreds of bottles, thousands at the very
    -- outside) that is microseconds. If it ever stops being: materialise this
    -- view and REFRESH it from the same places that revalidate the grid.
    (
      setweight(to_tsvector('english', coalesce(br.name::text, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(e.name::text, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(e.batch, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(e.age_statement, '')), 'B') ||
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
    -- The same corpus as plain text. Full text cannot match a prefix, and
    -- nobody typing "goose" wants nothing on the way to "gooseberry" — so the
    -- grid ORs a substring match over this against the tsvector above. One
    -- column so the two can never cover different fields.
    concat_ws(' ',
      br.name::text, e.name::text, e.batch, e.age_statement, c.name::text, s.name::text,
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
