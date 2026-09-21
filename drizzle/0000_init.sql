CREATE TABLE "bottle_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"bottle_id" integer NOT NULL,
	"file_path" text NOT NULL,
	"thumb_path" text,
	"caption" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bottle_tags" (
	"bottle_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "bottle_tags_bottle_id_tag_id_pk" PRIMARY KEY("bottle_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "bottles" (
	"id" serial PRIMARY KEY NOT NULL,
	"expression_id" integer NOT NULL,
	"price_paid" numeric(10, 2),
	"store_id" integer,
	"date_acquired" date,
	"acquisition" text DEFAULT 'purchase' NOT NULL,
	"acquisition_notes" text,
	"is_open" boolean DEFAULT false NOT NULL,
	"date_opened" date,
	"fill_pct" smallint DEFAULT 100 NOT NULL,
	"date_killed" date,
	"status" text DEFAULT 'owned' NOT NULL,
	"location" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"estimated_value" numeric(10, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bottles_fill_pct_check" CHECK ("bottles"."fill_pct" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"company_id" integer,
	"is_ndp" boolean DEFAULT false NOT NULL,
	"notes" text,
	CONSTRAINT "brands_name_unique" UNIQUE("name"),
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"parent_id" integer,
	"field_group" text DEFAULT 'other' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_name_parent_id_unique" UNIQUE("name","parent_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"parent_id" integer,
	"country" text,
	"website" text,
	"notes" text,
	CONSTRAINT "companies_name_unique" UNIQUE("name"),
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "distilleries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"company_id" integer,
	"city" text,
	"state" text,
	"country" text DEFAULT 'USA' NOT NULL,
	"dsp_number" text,
	"founded" integer,
	"notes" text,
	CONSTRAINT "distilleries_name_unique" UNIQUE("name"),
	CONSTRAINT "distilleries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "expression_distilleries" (
	"expression_id" integer NOT NULL,
	"distillery_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"share_pct" numeric(5, 2),
	CONSTRAINT "expression_distilleries_expression_id_distillery_id_pk" PRIMARY KEY("expression_id","distillery_id")
);
--> statement-breakpoint
CREATE TABLE "expression_finishes" (
	"expression_id" integer NOT NULL,
	"finish_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"months" integer,
	CONSTRAINT "expression_finishes_expression_id_finish_id_pk" PRIMARY KEY("expression_id","finish_id")
);
--> statement-breakpoint
CREATE TABLE "expression_mashbills" (
	"expression_id" integer NOT NULL,
	"mashbill_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"share_pct" numeric(5, 2),
	CONSTRAINT "expression_mashbills_expression_id_mashbill_id_pk" PRIMARY KEY("expression_id","mashbill_id")
);
--> statement-breakpoint
CREATE TABLE "expressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"batch" text,
	"release_year" integer,
	"is_single_barrel" boolean DEFAULT false NOT NULL,
	"barrel_number" text,
	"bottle_count" integer,
	"proof" numeric(5, 2),
	"abv" numeric(5, 2) GENERATED ALWAYS AS ((proof / 2.0)) STORED,
	"is_cask_strength" boolean DEFAULT false NOT NULL,
	"is_bottled_in_bond" boolean DEFAULT false NOT NULL,
	"is_single_barrel_pick" boolean DEFAULT false NOT NULL,
	"pick_name" text,
	"picked_by" text,
	"barrel_filled_on" date,
	"bottled_on" date,
	"warehouse" text,
	"rick_floor" text,
	"age_years" numeric(4, 1),
	"age_months" integer,
	"age_days" integer,
	"age_statement" text,
	"is_chill_filtered" boolean,
	"color_added" boolean,
	"entry_proof" numeric(5, 2),
	"char_level" text,
	"msrp" numeric(10, 2),
	"size_ml" integer DEFAULT 750 NOT NULL,
	"upc" text,
	"label_notes" text,
	"description" text,
	"still_type" text,
	"estate" text,
	"marque" text,
	"ester_gl" numeric(8, 2),
	"sugar_g_per_l" numeric(6, 2),
	"is_solera" boolean,
	"solera_range" text,
	"tropical_years" numeric(4, 1),
	"continental_years" numeric(4, 1),
	"molasses_or_cane" text,
	"agave_type" text,
	"agave_region" text,
	"cooking_method" text,
	"extraction" text,
	"is_additive_free" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expressions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "expressions_brand_id_name_batch_unique" UNIQUE("brand_id","name","batch")
);
--> statement-breakpoint
CREATE TABLE "finishes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"finish_type" text DEFAULT 'other' NOT NULL,
	"notes" text,
	CONSTRAINT "finishes_name_unique" UNIQUE("name"),
	CONSTRAINT "finishes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "mashbills" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext",
	"corn" numeric(5, 2) DEFAULT '0' NOT NULL,
	"rye" numeric(5, 2) DEFAULT '0' NOT NULL,
	"wheat" numeric(5, 2) DEFAULT '0' NOT NULL,
	"malted_barley" numeric(5, 2) DEFAULT '0' NOT NULL,
	"malted_rye" numeric(5, 2) DEFAULT '0' NOT NULL,
	"other_grain" numeric(5, 2) DEFAULT '0' NOT NULL,
	"other_grain_name" text,
	"distillery_id" integer,
	"notes" text,
	CONSTRAINT "mashbill_sums_to_100" CHECK ("mashbills"."corn" + "mashbills"."rye" + "mashbills"."wheat" + "mashbills"."malted_barley" + "mashbills"."malted_rye" + "mashbills"."other_grain" BETWEEN 99.0 AND 101.0)
);
--> statement-breakpoint
CREATE TABLE "pours" (
	"id" serial PRIMARY KEY NOT NULL,
	"bottle_id" integer NOT NULL,
	"poured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount_ml" numeric(6, 2),
	"occasion" text
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"location" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"url" text,
	"notes" text,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug"),
	CONSTRAINT "stores_name_location_unique" UNIQUE("name","location")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tasting_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"bottle_id" integer NOT NULL,
	"tasted_on" date DEFAULT CURRENT_DATE NOT NULL,
	"rating" numeric(3, 1),
	"nose" text,
	"palate" text,
	"finish" text,
	"overall" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasting_notes_rating_check" CHECK ("tasting_notes"."rating" BETWEEN 0 AND 10)
);
--> statement-breakpoint
ALTER TABLE "bottle_images" ADD CONSTRAINT "bottle_images_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottle_tags" ADD CONSTRAINT "bottle_tags_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottle_tags" ADD CONSTRAINT "bottle_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_expression_id_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."expressions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_id_companies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_distilleries" ADD CONSTRAINT "expression_distilleries_expression_id_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."expressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_distilleries" ADD CONSTRAINT "expression_distilleries_distillery_id_distilleries_id_fk" FOREIGN KEY ("distillery_id") REFERENCES "public"."distilleries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_finishes" ADD CONSTRAINT "expression_finishes_expression_id_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."expressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_finishes" ADD CONSTRAINT "expression_finishes_finish_id_finishes_id_fk" FOREIGN KEY ("finish_id") REFERENCES "public"."finishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_mashbills" ADD CONSTRAINT "expression_mashbills_expression_id_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."expressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_mashbills" ADD CONSTRAINT "expression_mashbills_mashbill_id_mashbills_id_fk" FOREIGN KEY ("mashbill_id") REFERENCES "public"."mashbills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mashbills" ADD CONSTRAINT "mashbills_distillery_id_distilleries_id_fk" FOREIGN KEY ("distillery_id") REFERENCES "public"."distilleries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pours" ADD CONSTRAINT "pours_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bottle_images_one_primary" ON "bottle_images" USING btree ("bottle_id") WHERE "bottle_images"."is_primary";--> statement-breakpoint
CREATE INDEX "bottles_expression_idx" ON "bottles" USING btree ("expression_id");--> statement-breakpoint
CREATE INDEX "bottles_store_idx" ON "bottles" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "bottles_status_idx" ON "bottles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brands_company_idx" ON "brands" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "companies_parent_idx" ON "companies" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "distilleries_company_idx" ON "distilleries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "expressions_brand_idx" ON "expressions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "expressions_category_idx" ON "expressions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pours_bottle_idx" ON "pours" USING btree ("bottle_id");--> statement-breakpoint
CREATE INDEX "tasting_notes_bottle_idx" ON "tasting_notes" USING btree ("bottle_id");