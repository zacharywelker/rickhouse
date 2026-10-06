-- A known release's own label photo and notes, shown on its page. The photo
-- files live on the uploads volume like a label's; deleting the release
-- deletes them in the app, since Postgres cannot reach the files.
ALTER TABLE "expression_releases" ADD COLUMN "photo_path" text;
--> statement-breakpoint
ALTER TABLE "expression_releases" ADD COLUMN "photo_thumb_path" text;
--> statement-breakpoint
ALTER TABLE "expression_releases" ADD COLUMN "notes" text;
