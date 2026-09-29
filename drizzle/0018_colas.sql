-- TTB label approvals (COLAs) on a label. One product usually has several:
-- each proof, size, relabel and pick is approved separately. The fetched
-- columns are a copy of the public registry record, refreshed on demand.
CREATE TABLE "expression_colas" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"expression_id" integer NOT NULL,
	"ttb_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"note" text,
	"status" text,
	"brand_name" text,
	"fanciful_name" text,
	"class_type_code" text,
	"class_type" text,
	"origin_code" text,
	"origin" text,
	"is_imported" boolean,
	"applicant_name" text,
	"applicant_address" text,
	"permit_number" text,
	"serial_number" text,
	"approved_on" date,
	"fetched_at" timestamp with time zone,
	"fetch_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expression_colas_ttb_id_check" CHECK ("ttb_id" ~ '^[0-9]{14}$'),
	CONSTRAINT "expression_colas_expression_ttb_unique" UNIQUE ("expression_id", "ttb_id"),
	CONSTRAINT "expression_colas_id_owner_unique" UNIQUE ("id", "owner_id"),
	CONSTRAINT "expression_colas_expression_owner_fk" FOREIGN KEY ("expression_id", "owner_id")
		REFERENCES "expressions"("id", "owner_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "expression_colas_owner_idx" ON "expression_colas" ("owner_id");
--> statement-breakpoint
CREATE INDEX "expression_colas_ttb_idx" ON "expression_colas" ("ttb_id");
--> statement-breakpoint
-- The approved label panels, stored on the uploads volume like bottle photos.
CREATE TABLE "cola_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"cola_id" integer NOT NULL REFERENCES "expression_colas"("id") ON DELETE CASCADE,
	"file_path" text NOT NULL,
	"thumb_path" text,
	"panel" text,
	"width" integer,
	"height" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cola_images_cola_idx" ON "cola_images" ("cola_id");
