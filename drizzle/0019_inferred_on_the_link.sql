-- "Inferred" is a claim about one label, not about a distillery: MGP made some
-- bottles that say so and others that only hint at it. So the flag moves from
-- the distillery to the link between a label and the distillery it names.
ALTER TABLE "expression_distilleries" ADD COLUMN "is_inferred" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Anything already marked inferred keeps that meaning, on every label it was linked to.
UPDATE "expression_distilleries" ed SET "is_inferred" = true
	FROM "distilleries" d WHERE d."id" = ed."distillery_id" AND d."disclosure" = 'inferred';
--> statement-breakpoint
UPDATE "distilleries" SET "disclosure" = 'named' WHERE "disclosure" = 'inferred';
--> statement-breakpoint
ALTER TABLE "distilleries" DROP CONSTRAINT "distilleries_disclosure_check";
--> statement-breakpoint
ALTER TABLE "distilleries" ADD CONSTRAINT "distilleries_disclosure_check"
	CHECK ("disclosure" IN ('named', 'undisclosed'));
