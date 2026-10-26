-- Existing numeric ages may have been typed or filled by old designation rules.
-- Keep them classified as entered rather than guessing their source.
ALTER TABLE expressions ADD COLUMN age_years_source text NOT NULL DEFAULT 'entered'
  CHECK (age_years_source IN ('entered', 'derived'));
--> statement-breakpoint
ALTER TABLE expression_releases ADD COLUMN age_years_source text NOT NULL DEFAULT 'entered'
  CHECK (age_years_source IN ('entered', 'derived'));
--> statement-breakpoint
ALTER TABLE bottles ADD COLUMN age_years_source text NOT NULL DEFAULT 'entered'
  CHECK (age_years_source IN ('entered', 'derived'));
