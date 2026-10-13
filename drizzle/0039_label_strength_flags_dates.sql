-- Navy Strength and Overproof are worked out from the proof, so only Still Proof (an unaged tequila bottled
-- undiluted from the still) is a flag of its own.
ALTER TABLE "expressions" ADD COLUMN "is_still_proof" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- When the product is usually barrel-filled (distilled) and bottled. A bottle inherits these unless it has its own.
ALTER TABLE "expressions" ADD COLUMN "barrel_filled_on" date;
--> statement-breakpoint
ALTER TABLE "expressions" ADD COLUMN "bottled_on" date;
--> statement-breakpoint
-- "Notes on the bottle label" is folded into the description; what was in it is not carried over.
ALTER TABLE "expressions" DROP COLUMN "label_notes";
