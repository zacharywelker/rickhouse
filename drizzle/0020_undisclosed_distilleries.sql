-- Labels that never name their distillery ("Distilled in Indiana", "Bottled in
-- Kentucky"). Who bottled it, or where, is left to the label notes.
--
-- A distillery row is either 'named' (a real distillery) or 'undisclosed' (a
-- placeholder for a place a label admits to and nothing more: "Undisclosed
-- (Indiana)"). Whether a link to a real distillery is a guess is not the
-- distillery's business: MGP is stated on one label and only inferred on
-- another, so the flag lives on the link.
ALTER TABLE "distilleries" ADD COLUMN "disclosure" text DEFAULT 'named' NOT NULL;
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_disclosure_check"
	CHECK ("disclosure" IN ('named', 'undisclosed'));
--> statement-breakpoint
ALTER TABLE "expression_distilleries" ADD COLUMN "is_inferred" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
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
    b.batch,
    b.release_year,
    b.is_single_barrel,
    b.is_single_barrel_pick,
    b.pick_name,
    b.barrel_filled_on,
    b.bottled_on,
    e.id AS expression_id,
    e.name AS expression_name,
    COALESCE(b.proof, e.proof) AS proof,
    COALESCE(b.abv, e.abv) AS abv,
    COALESCE(b.age_years, e.age_years) AS age_years,
    COALESCE(b.age_statement, e.age_statement) AS age_statement,
    b.proof IS NULL AND e.proof IS NOT NULL AS proof_inherited,
    b.age_years IS NULL AND b.age_statement IS NULL AND (e.age_years IS NOT NULL OR e.age_statement IS NOT NULL) AS age_inherited,
    e.msrp,
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
    ( SELECT bi.thumb_path
           FROM bottle_images bi
          WHERE bi.bottle_id = b.id
          ORDER BY bi.is_primary DESC, bi.sort_order, bi.id
         LIMIT 1) AS thumb_path,
    (((((((((((setweight(to_tsvector('english'::regconfig, COALESCE(br.name::text, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(e.name::text, ''::text)), 'A'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.batch, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.pick_name, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.picked_by, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.age_statement, e.age_statement, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(c.name::text, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(s.name::text, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(( SELECT string_agg(d.name::text, ' '::text) AS string_agg
           FROM expression_distilleries ed
             JOIN distilleries d ON d.id = ed.distillery_id
          WHERE ed.expression_id = e.id), ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(( SELECT string_agg(f.name::text, ' '::text) AS string_agg
           FROM expression_finishes ef
             JOIN finishes f ON f.id = ef.finish_id
          WHERE ef.expression_id = e.id), ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(e.description, ''::text)), 'C'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(b.notes, ''::text)), 'C'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(( SELECT string_agg(concat_ws(' '::text, tn.nose, tn.palate, tn.finish, tn.overall), ' '::text) AS string_agg
           FROM tasting_notes tn
          WHERE tn.bottle_id = b.id), ''::text)), 'C'::"char") AS search,
    concat_ws(' '::text, br.name::text, e.name::text, b.batch, b.pick_name, b.picked_by, COALESCE(b.age_statement, e.age_statement), c.name::text, s.name::text, ( SELECT string_agg(d.name::text, ' '::text) AS string_agg
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
          WHERE ed.expression_id = e.id) AS distillery_links
   FROM bottles b
     JOIN expressions e ON e.id = b.expression_id
     JOIN brands br ON br.id = e.brand_id
     JOIN categories c ON c.id = e.category_id
     LEFT JOIN stores s ON s.id = b.store_id;
