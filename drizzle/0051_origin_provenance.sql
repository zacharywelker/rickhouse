ALTER TABLE expressions ADD COLUMN origin_country_manual boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN origin_region_manual boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Existing nonempty origin fields were entered before automatic suggestions existed.
UPDATE expressions SET origin_country_manual = true WHERE origin_country IS NOT NULL AND trim(origin_country) <> '';
--> statement-breakpoint
UPDATE expressions SET origin_region_manual = true WHERE origin_region IS NOT NULL AND trim(origin_region) <> '';
