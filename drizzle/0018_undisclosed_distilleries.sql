-- Labels that never name their distillery ("Distilled in Indiana", "Bottled in
-- Kentucky"), and the bottler when it is the only name on the bottle.
--
-- A distillery row can now say how much is known about it. 'named' is every
-- row that exists today. 'undisclosed' is a placeholder for a place the label
-- admits to and nothing more ("Undisclosed (Indiana)"). 'inferred' is a real
-- distillery someone identified from outside the label, kept apart from
-- 'named' so a guess never reads as a fact.
ALTER TABLE "distilleries" ADD COLUMN "disclosure" text DEFAULT 'named' NOT NULL;
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_disclosure_check"
	CHECK ("disclosure" IN ('named', 'undisclosed', 'inferred'));
--> statement-breakpoint
-- Who bottled it, which is a different claim from who distilled it. A company,
-- so "everything Luxco bottled" works the same way the brand's owner does.
ALTER TABLE "expressions" ADD COLUMN "bottled_by_id" integer;
--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_bottled_by_id_owner_id_fkey"
	FOREIGN KEY ("bottled_by_id", "owner_id") REFERENCES "companies"("id", "owner_id") ON DELETE SET NULL ("bottled_by_id");
--> statement-breakpoint
CREATE INDEX "expressions_bottled_by_idx" ON "expressions" ("bottled_by_id");
