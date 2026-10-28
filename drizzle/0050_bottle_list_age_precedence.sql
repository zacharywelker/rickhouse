-- Resolve all age fields from one source: bottle, then release, then label.
-- A statement-only bottle or release must not borrow numeric age from its parent.
CREATE OR REPLACE VIEW "bottle_list" AS
 SELECT b.id,
    b.status,
    b.is_open,
    b.fill_pct,
    b.price_paid,
    b.date_acquired,
    b.date_opened,
    b.is_favorite,
    b.store_id,
    CASE WHEN c.field_group IN ('vodka', 'amaro', 'liqueur') THEN NULL ELSE COALESCE(r.name::text, b.batch) END AS batch,
    CASE WHEN c.field_group IN ('vodka', 'amaro', 'liqueur') THEN NULL ELSE COALESCE(r.release_year, b.release_year) END AS release_year,
    CASE WHEN c.field_group IN ('vodka', 'amaro', 'liqueur') THEN false ELSE b.is_single_barrel END AS is_single_barrel,
    CASE WHEN c.field_group IN ('vodka', 'amaro', 'liqueur') THEN false ELSE b.is_single_barrel_pick END AS is_single_barrel_pick,
    CASE WHEN c.field_group IN ('vodka', 'amaro', 'liqueur') THEN NULL ELSE b.pick_name END AS pick_name,
    b.barrel_filled_on,
    b.bottled_on,
    e.id AS expression_id,
    e.name AS expression_name,
    CASE WHEN c.field_group IN ('amaro', 'liqueur') THEN e.proof ELSE COALESCE(b.proof, r.proof, e.proof) END AS proof,
    CASE WHEN c.field_group IN ('amaro', 'liqueur') THEN e.abv ELSE COALESCE(b.abv, r.abv, e.abv) END AS abv,
    -- Cast back to numeric(4,1): a CASE with NULL branches drops the precision, and
    -- CREATE OR REPLACE VIEW refuses to change an existing column's type.
    (CASE WHEN c.field_group = 'vodka' OR (c.field_group = 'gin' AND NOT e.is_aged_gin) THEN NULL WHEN c.field_group IN ('amaro', 'liqueur') THEN CASE WHEN e.is_aged THEN e.age_years ELSE NULL END WHEN (b.age_years IS NOT NULL OR b.age_months IS NOT NULL OR b.age_days IS NOT NULL OR b.age_statement IS NOT NULL) THEN b.age_years WHEN (r.age_years IS NOT NULL OR r.age_months IS NOT NULL OR r.age_days IS NOT NULL OR r.age_statement IS NOT NULL) THEN r.age_years ELSE e.age_years END)::numeric(4,1) AS age_years,
    CASE WHEN c.field_group = 'vodka' OR (c.field_group = 'gin' AND NOT e.is_aged_gin) THEN NULL WHEN c.field_group IN ('amaro', 'liqueur') THEN CASE WHEN e.is_aged THEN e.age_statement ELSE NULL END WHEN (b.age_years IS NOT NULL OR b.age_months IS NOT NULL OR b.age_days IS NOT NULL OR b.age_statement IS NOT NULL) THEN b.age_statement WHEN (r.age_years IS NOT NULL OR r.age_months IS NOT NULL OR r.age_days IS NOT NULL OR r.age_statement IS NOT NULL) THEN r.age_statement ELSE e.age_statement END AS age_statement,
    b.proof IS NULL AND COALESCE(r.proof, e.proof) IS NOT NULL AS proof_inherited,
    (c.field_group <> 'vodka' AND NOT (c.field_group = 'gin' AND NOT e.is_aged_gin) AND b.age_years IS NULL AND b.age_months IS NULL AND b.age_days IS NULL AND b.age_statement IS NULL AND ((r.age_years IS NOT NULL OR r.age_months IS NOT NULL OR r.age_days IS NOT NULL OR r.age_statement IS NOT NULL) OR e.age_years IS NOT NULL OR e.age_months IS NOT NULL OR e.age_days IS NOT NULL OR e.age_statement IS NOT NULL)) AS age_inherited,
    COALESCE(r.msrp, e.msrp) AS msrp,
    br.id AS brand_id,
    br.name AS brand,
    c.id AS category_id,
    c.name AS category,
    c.field_group,
    s.name AS store,
    ( SELECT string_agg(d.name::text, ', '::text ORDER BY ed."position") AS string_agg
           FROM expression_distilleries ed
             JOIN distilleries d ON d.id = ed.distillery_id
          WHERE ed.expression_id = e.id) AS distilleries,
    ( SELECT string_agg(f.name::text, ', '::text ORDER BY ef."position") AS string_agg
           FROM expression_finishes ef
             JOIN finishes f ON f.id = ef.finish_id
          WHERE ef.expression_id = e.id) AS finishes,
    ( SELECT round(avg(tn.rating), 1) AS round
           FROM tasting_notes tn
          WHERE tn.bottle_id = b.id) AS avg_rating,
    COALESCE(( SELECT bi.thumb_path
           FROM bottle_images bi
          WHERE bi.bottle_id = b.id
          ORDER BY bi.is_primary DESC, bi.sort_order, bi.id
         LIMIT 1), r.photo_thumb_path, r.photo_path, e.photo_thumb_path) AS thumb_path,
    (((((((((((setweight(to_tsvector('english'::regconfig, COALESCE(br.name::text, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(e.name::text, ''::text)), 'A'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(r.name::text, b.batch, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.pick_name, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.picked_by, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.age_statement, r.age_statement, e.age_statement, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(c.name::text, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(s.name::text, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(( SELECT string_agg(d.name::text, ' '::text) AS string_agg
           FROM expression_distilleries ed
             JOIN distilleries d ON d.id = ed.distillery_id
          WHERE ed.expression_id = e.id), ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(( SELECT string_agg(f.name::text, ' '::text) AS string_agg
           FROM expression_finishes ef
             JOIN finishes f ON f.id = ef.finish_id
          WHERE ef.expression_id = e.id), ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(e.description, ''::text)), 'C'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.notes, ''::text)), 'C'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(( SELECT string_agg(concat_ws(' '::text, tn.nose, tn.palate, tn.finish, tn.overall), ' '::text) AS string_agg
           FROM tasting_notes tn
          WHERE tn.bottle_id = b.id), ''::text)), 'C'::"char") AS search,
    concat_ws(' '::text, br.name::text, e.name::text, COALESCE(r.name::text, b.batch), b.pick_name, b.picked_by, COALESCE(b.age_statement, r.age_statement, e.age_statement), c.name::text, s.name::text, ( SELECT string_agg(d.name::text, ' '::text) AS string_agg
           FROM expression_distilleries ed
             JOIN distilleries d ON d.id = ed.distillery_id
          WHERE ed.expression_id = e.id), ( SELECT string_agg(f.name::text, ' '::text) AS string_agg
           FROM expression_finishes ef
             JOIN finishes f ON f.id = ef.finish_id
          WHERE ef.expression_id = e.id), e.description, b.notes, ( SELECT string_agg(concat_ws(' '::text, tn.nose, tn.palate, tn.finish, tn.overall), ' '::text) AS string_agg
           FROM tasting_notes tn
          WHERE tn.bottle_id = b.id)) AS search_text,
    b.owner_id,
    -- Each distillery with its per-label flag, so a table can colour an inferred
    -- one without splitting a comma-joined string. Last, so the view is replaced in place.
    ( SELECT jsonb_agg(jsonb_build_object('name', d.name::text, 'inferred', ed.is_inferred) ORDER BY ed."position")
           FROM expression_distilleries ed
             JOIN distilleries d ON d.id = ed.distillery_id
          WHERE ed.expression_id = e.id) AS distillery_links,
    -- The rest of the age, so a list can say "12y 4m" rather than only the
    -- years. Last, so the view is replaced in place.
    CASE WHEN c.field_group = 'vodka' OR (c.field_group = 'gin' AND NOT e.is_aged_gin) THEN NULL WHEN c.field_group IN ('amaro', 'liqueur') THEN CASE WHEN e.is_aged THEN e.age_months ELSE NULL END WHEN (b.age_years IS NOT NULL OR b.age_months IS NOT NULL OR b.age_days IS NOT NULL OR b.age_statement IS NOT NULL) THEN b.age_months WHEN (r.age_years IS NOT NULL OR r.age_months IS NOT NULL OR r.age_days IS NOT NULL OR r.age_statement IS NOT NULL) THEN r.age_months ELSE e.age_months END AS age_months,
    CASE WHEN c.field_group = 'vodka' OR (c.field_group = 'gin' AND NOT e.is_aged_gin) THEN NULL WHEN c.field_group IN ('amaro', 'liqueur') THEN CASE WHEN e.is_aged THEN e.age_days ELSE NULL END WHEN (b.age_years IS NOT NULL OR b.age_months IS NOT NULL OR b.age_days IS NOT NULL OR b.age_statement IS NOT NULL) THEN b.age_days WHEN (r.age_years IS NOT NULL OR r.age_months IS NOT NULL OR r.age_days IS NOT NULL OR r.age_statement IS NOT NULL) THEN r.age_days ELSE e.age_days END AS age_days,
    -- The chosen release, so a list can link or filter by it.
    b.release_id,
    CASE WHEN c.field_group IN ('vodka', 'amaro', 'liqueur') THEN NULL ELSE r.name END AS release_name,
    -- Whether the photo behind thumb_path is a cutout. It follows the same
    -- source as thumb_path (the bottle's own photo, then the release's, then
    -- the label's) rather than coalescing the flags, so a photo whose flag is
    -- still unknown never borrows the flag of a different photo. Last, so the
    -- view is replaced in place.
    CASE
        WHEN ( SELECT bi.thumb_path
               FROM bottle_images bi
              WHERE bi.bottle_id = b.id
              ORDER BY bi.is_primary DESC, bi.sort_order, bi.id
             LIMIT 1) IS NOT NULL
        THEN ( SELECT bi.is_cutout
               FROM bottle_images bi
              WHERE bi.bottle_id = b.id
              ORDER BY bi.is_primary DESC, bi.sort_order, bi.id
             LIMIT 1)
        WHEN COALESCE(r.photo_thumb_path, r.photo_path) IS NOT NULL THEN r.photo_is_cutout
        ELSE e.photo_is_cutout
    END AS thumb_is_cutout
   FROM bottles b
     JOIN expressions e ON e.id = b.expression_id
     JOIN brands br ON br.id = e.brand_id
     JOIN categories c ON c.id = e.category_id
     LEFT JOIN stores s ON s.id = b.store_id
     LEFT JOIN expression_releases r ON r.id = b.release_id;
