-- Older names a label or a distillery has gone by. A bottle can say which
-- version of its label it is (NULL = the label's current name), and a search
-- finds the label or distillery under any of them. The years are optional and
-- only for display: "Old Grand-Dad Bonded, 1980–1995".
CREATE TABLE "expression_names" (
	"id" serial PRIMARY KEY NOT NULL,
	"expression_id" integer NOT NULL REFERENCES "expressions"("id") ON DELETE CASCADE,
	"name" citext NOT NULL,
	"year_from" integer,
	"year_to" integer,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expression_names_expression_name_unique" UNIQUE ("expression_id", "name"),
	CONSTRAINT "expression_names_years_check" CHECK ("year_from" IS NULL OR "year_to" IS NULL OR "year_from" <= "year_to")
);
--> statement-breakpoint
CREATE INDEX "expression_names_expression_idx" ON "expression_names" ("expression_id");
--> statement-breakpoint
CREATE TABLE "distillery_names" (
	"id" serial PRIMARY KEY NOT NULL,
	"distillery_id" integer NOT NULL REFERENCES "distilleries"("id") ON DELETE CASCADE,
	"name" citext NOT NULL,
	"year_from" integer,
	"year_to" integer,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "distillery_names_distillery_name_unique" UNIQUE ("distillery_id", "name"),
	CONSTRAINT "distillery_names_years_check" CHECK ("year_from" IS NULL OR "year_to" IS NULL OR "year_from" <= "year_to")
);
--> statement-breakpoint
CREATE INDEX "distillery_names_distillery_idx" ON "distillery_names" ("distillery_id");
--> statement-breakpoint
ALTER TABLE "bottles" ADD COLUMN "expression_name_id" integer REFERENCES "expression_names"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "bottles_expression_name_idx" ON "bottles" ("expression_name_id");
