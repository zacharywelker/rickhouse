-- Labels that never name their distillery ("Distilled in Indiana", "Bottled in
-- Kentucky"). Who bottled it, or where, is left to the label notes.
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
