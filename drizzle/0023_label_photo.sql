-- A label's own photo, separate from the photos of its bottles. Either can be
-- copied to the other from the bottle's or the label's page.
ALTER TABLE "expressions" ADD COLUMN "photo_path" text;
--> statement-breakpoint
ALTER TABLE "expressions" ADD COLUMN "photo_thumb_path" text;
