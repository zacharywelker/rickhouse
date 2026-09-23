-- Personal, curated collections (DESIGN.md §15/§23 — "The database tells you
-- what you own. Groups tell you what it means."), not saved filters. A
-- bottle can belong to many groups and a group holds many bottles, so this
-- is many-to-many like expression_finishes, with the same position column
-- for the order bottles were arranged in.
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" citext NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_image_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_name_unique" UNIQUE("name"),
	CONSTRAINT "groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "group_bottles" (
	"group_id" integer NOT NULL,
	"bottle_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_bottles_group_id_bottle_id_pk" PRIMARY KEY("group_id","bottle_id")
);
--> statement-breakpoint
ALTER TABLE "group_bottles" ADD CONSTRAINT "group_bottles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "group_bottles" ADD CONSTRAINT "group_bottles_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "group_bottles_bottle_idx" ON "group_bottles" USING btree ("bottle_id");
