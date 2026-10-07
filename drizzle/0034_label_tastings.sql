-- A tasting belongs to a label (expression), and the bottle is optional (SPEC M9), so a pour of a bottle you
-- do not own can be kept. Every existing note takes its label and owner from its bottle, so nothing moves.
-- New: where it was tasted (source, tasted_at) and the flavor descriptors chosen from the label's wheel (tags).
ALTER TABLE "tasting_notes"
	ADD COLUMN "owner_id" integer,
	ADD COLUMN "expression_id" integer,
	ADD COLUMN "source" text DEFAULT 'owned' NOT NULL,
	ADD COLUMN "tasted_at" text,
	ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
UPDATE "tasting_notes" tn
	SET "owner_id" = b."owner_id", "expression_id" = b."expression_id"
	FROM "bottles" b
	WHERE b."id" = tn."bottle_id";
--> statement-breakpoint
ALTER TABLE "tasting_notes"
	ALTER COLUMN "owner_id" SET NOT NULL,
	ALTER COLUMN "expression_id" SET NOT NULL,
	ALTER COLUMN "bottle_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_source_check"
	CHECK ("source" IN ('owned', 'bar', 'bottle_share', 'sample', 'store_pour'));
--> statement-breakpoint
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_owner_id_users_id_fk"
	FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- The label must be the owner's own, as for every other table.
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_expression_owner_fk"
	FOREIGN KEY ("expression_id", "owner_id") REFERENCES "expressions"("id", "owner_id") ON DELETE CASCADE;
--> statement-breakpoint
-- A note's bottle must be a bottle of the note's label. With no bottle the key is not checked (MATCH SIMPLE).
-- Together with the key above this also keeps the bottle in the owner's account. Deleting a bottle keeps its
-- tastings: they stay on the label, with no bottle (SET NULL on bottle_id only; the label column stays).
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_id_expression_unique" UNIQUE ("id", "expression_id");
--> statement-breakpoint
ALTER TABLE "tasting_notes" DROP CONSTRAINT "tasting_notes_bottle_id_bottles_id_fk";
--> statement-breakpoint
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_bottle_expression_fk"
	FOREIGN KEY ("bottle_id", "expression_id") REFERENCES "bottles"("id", "expression_id") ON DELETE SET NULL ("bottle_id");
--> statement-breakpoint
CREATE INDEX "tasting_notes_expression_idx" ON "tasting_notes" ("expression_id", "tasted_on" DESC);
--> statement-breakpoint
CREATE INDEX "tasting_notes_owner_idx" ON "tasting_notes" ("owner_id", "tasted_on" DESC, "id" DESC);
