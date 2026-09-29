-- Labels that never name their distillery ("Distilled in Indiana", "Bottled in
-- Kentucky"), and the bottler when it is the only name on the bottle.
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
-- Who bottled it, and where: different claims from who distilled it. A company,
-- so "everything Luxco bottled" works the way the brand's owner does; and a
-- place, for labels that say where it was bottled but not by whom.
ALTER TABLE "expressions" ADD COLUMN "bottled_by_id" integer;
--> statement-breakpoint
ALTER TABLE "expressions" ADD COLUMN "bottled_in" text;
--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_bottled_by_id_owner_id_fkey"
	FOREIGN KEY ("bottled_by_id", "owner_id") REFERENCES "companies"("id", "owner_id") ON DELETE SET NULL ("bottled_by_id");
--> statement-breakpoint
CREATE INDEX "expressions_bottled_by_idx" ON "expressions" ("bottled_by_id");
