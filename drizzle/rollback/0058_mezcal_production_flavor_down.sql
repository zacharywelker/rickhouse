-- Undoes drizzle/0058_mezcal_production_flavor.sql. Not run by the migrator; run by hand after a backup.
-- Drops the two columns and what was entered in them. Mezcal flavors stay as ingredient links of kind flavor.
ALTER TABLE expressions
  DROP CONSTRAINT IF EXISTS expressions_mezcal_production_check,
  DROP CONSTRAINT IF EXISTS expressions_mezcal_flavor_method_check,
  DROP COLUMN IF EXISTS mezcal_production,
  DROP COLUMN IF EXISTS mezcal_flavor_method;
