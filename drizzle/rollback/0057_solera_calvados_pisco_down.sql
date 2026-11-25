-- Undoes drizzle/0057_solera_calvados_pisco.sql. Not run by the migrator; run by hand after a backup.
-- Drops the five columns and what was entered in them (the old free-text solera_range is untouched).
ALTER TABLE expressions
  DROP CONSTRAINT IF EXISTS expressions_solera_range_check,
  DROP CONSTRAINT IF EXISTS expressions_calvados_appellation_check,
  DROP CONSTRAINT IF EXISTS expressions_brandy_vintage_year_check,
  DROP COLUMN IF EXISTS solera_low_years,
  DROP COLUMN IF EXISTS solera_high_years,
  DROP COLUMN IF EXISTS calvados_appellation,
  DROP COLUMN IF EXISTS brandy_vintage_year,
  DROP COLUMN IF EXISTS is_mosto_verde;
