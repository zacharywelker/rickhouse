-- Private collections (M10 phase 2). Every catalog table except categories,
-- plus bottles and groups, gets an owner; names and slugs become unique per
-- owner; and the database itself refuses to link one owner's rows to
-- another's (composite foreign keys, and a trigger on the pure link tables).
--
-- Existing rows go to the first admin. An install upgrading straight from
-- the shared password has no users yet: a placeholder admin is created here
-- and scripts/bootstrap.ts gives it a password on the next start.
INSERT INTO "users" ("name", "email", "username", "role", "must_change_password")
SELECT 'Admin', 'admin@rickhouse.invalid', 'admin', 'admin', true
WHERE NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin')
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "username" = 'admin');
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "companies" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "companies_owner_idx" ON "companies" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "brands" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "brands_owner_idx" ON "brands" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "distilleries" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "distilleries" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "distilleries" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "distilleries_owner_idx" ON "distilleries" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "mashbills" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "mashbills" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "mashbills" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mashbills" ADD CONSTRAINT "mashbills_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mashbills_owner_idx" ON "mashbills" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "mashbills" ADD CONSTRAINT "mashbills_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "finishes" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "finishes" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "finishes" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "finishes" ADD CONSTRAINT "finishes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "finishes_owner_idx" ON "finishes" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "finishes" ADD CONSTRAINT "finishes_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "stores" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "stores_owner_idx" ON "stores" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "tags" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tags_owner_idx" ON "tags" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "expressions" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "expressions" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "expressions" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "expressions_owner_idx" ON "expressions" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "bottles" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "bottles" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "bottles" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "bottles_owner_idx" ON "bottles" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "owner_id" integer;
--> statement-breakpoint
UPDATE "groups" SET "owner_id" = (
  SELECT "id" FROM "users" ORDER BY ("role" = 'admin') DESC, "id" LIMIT 1
);
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "owner_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "groups_owner_idx" ON "groups" USING btree ("owner_id");
--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_id_owner_unique" UNIQUE ("id", "owner_id");
--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "companies_name_unique";
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_name_unique" UNIQUE ("owner_id", "name");
--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "companies_slug_unique";
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "brands" DROP CONSTRAINT "brands_name_unique";
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_owner_name_unique" UNIQUE ("owner_id", "name");
--> statement-breakpoint
ALTER TABLE "brands" DROP CONSTRAINT "brands_slug_unique";
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "distilleries" DROP CONSTRAINT "distilleries_name_unique";
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_owner_name_unique" UNIQUE ("owner_id", "name");
--> statement-breakpoint
ALTER TABLE "distilleries" DROP CONSTRAINT "distilleries_slug_unique";
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "finishes" DROP CONSTRAINT "finishes_name_unique";
--> statement-breakpoint
ALTER TABLE "finishes" ADD CONSTRAINT "finishes_owner_name_unique" UNIQUE ("owner_id", "name");
--> statement-breakpoint
ALTER TABLE "finishes" DROP CONSTRAINT "finishes_slug_unique";
--> statement-breakpoint
ALTER TABLE "finishes" ADD CONSTRAINT "finishes_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_name_unique";
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_name_unique" UNIQUE ("owner_id", "name");
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_slug_unique";
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_name_unique";
--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_name_unique" UNIQUE ("owner_id", "name");
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_slug_unique";
--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_slug_unique";
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "expressions" DROP CONSTRAINT "expressions_slug_unique";
--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_owner_slug_unique" UNIQUE ("owner_id", "slug");
--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_name_location_unique";
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_name_location_unique" UNIQUE ("owner_id", "name", "location");
--> statement-breakpoint
-- NO ACTION rather than RESTRICT where it used to be RESTRICT: it is
-- checked at the end of the statement, so deleting a user can cascade through
-- their labels and bottles together, while deleting a label that still has
-- bottles fails exactly as before.
ALTER TABLE "companies" DROP CONSTRAINT "companies_parent_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_id_companies_id_fk" FOREIGN KEY ("parent_id", "owner_id") REFERENCES "public"."companies"("id", "owner_id") ON DELETE SET NULL ("parent_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brands" DROP CONSTRAINT "brands_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_id_companies_id_fk" FOREIGN KEY ("company_id", "owner_id") REFERENCES "public"."companies"("id", "owner_id") ON DELETE SET NULL ("company_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "distilleries" DROP CONSTRAINT "distilleries_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_company_id_companies_id_fk" FOREIGN KEY ("company_id", "owner_id") REFERENCES "public"."companies"("id", "owner_id") ON DELETE SET NULL ("company_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expressions" DROP CONSTRAINT "expressions_brand_id_brands_id_fk";
--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id", "owner_id") REFERENCES "public"."brands"("id", "owner_id") ON DELETE NO ACTION ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bottles" DROP CONSTRAINT "bottles_expression_id_expressions_id_fk";
--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_expression_id_expressions_id_fk" FOREIGN KEY ("expression_id", "owner_id") REFERENCES "public"."expressions"("id", "owner_id") ON DELETE NO ACTION ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bottles" DROP CONSTRAINT "bottles_store_id_stores_id_fk";
--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_store_id_stores_id_fk" FOREIGN KEY ("store_id", "owner_id") REFERENCES "public"."stores"("id", "owner_id") ON DELETE SET NULL ("store_id") ON UPDATE no action;
--> statement-breakpoint
-- Link tables have no owner of their own; every row they point at must share
-- one. Arguments are (column, table) pairs; NULL references are skipped.
CREATE FUNCTION "assert_same_owner"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i integer;
  ref_id integer;
  ref_owner integer;
  first_owner integer;
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 BY 2 LOOP
    ref_id := (to_jsonb(NEW) ->> TG_ARGV[i])::integer;
    CONTINUE WHEN ref_id IS NULL;
    EXECUTE format('SELECT owner_id FROM %I WHERE id = $1', TG_ARGV[i + 1]) INTO ref_owner USING ref_id;
    IF first_owner IS NULL THEN
      first_owner := ref_owner;
    ELSIF ref_owner IS DISTINCT FROM first_owner THEN
      RAISE EXCEPTION '% links rows that belong to different accounts', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "expression_distilleries_same_owner" BEFORE INSERT OR UPDATE ON "expression_distilleries" FOR EACH ROW EXECUTE FUNCTION "assert_same_owner"('expression_id', 'expressions', 'distillery_id', 'distilleries');
--> statement-breakpoint
CREATE TRIGGER "expression_mashbills_same_owner" BEFORE INSERT OR UPDATE ON "expression_mashbills" FOR EACH ROW EXECUTE FUNCTION "assert_same_owner"('expression_id', 'expressions', 'mashbill_id', 'mashbills', 'distillery_id', 'distilleries');
--> statement-breakpoint
CREATE TRIGGER "expression_finishes_same_owner" BEFORE INSERT OR UPDATE ON "expression_finishes" FOR EACH ROW EXECUTE FUNCTION "assert_same_owner"('expression_id', 'expressions', 'finish_id', 'finishes');
--> statement-breakpoint
CREATE TRIGGER "bottle_tags_same_owner" BEFORE INSERT OR UPDATE ON "bottle_tags" FOR EACH ROW EXECUTE FUNCTION "assert_same_owner"('bottle_id', 'bottles', 'tag_id', 'tags');
--> statement-breakpoint
CREATE TRIGGER "group_bottles_same_owner" BEFORE INSERT OR UPDATE ON "group_bottles" FOR EACH ROW EXECUTE FUNCTION "assert_same_owner"('group_id', 'groups', 'bottle_id', 'bottles');
--> statement-breakpoint
-- The grid filters on owner; the new column goes last so the view can be
-- replaced in place.
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
    b.owner_id
   FROM bottles b
     JOIN expressions e ON e.id = b.expression_id
     JOIN brands br ON br.id = e.brand_id
     JOIN categories c ON c.id = e.category_id
     LEFT JOIN stores s ON s.id = b.store_id;
