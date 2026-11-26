-- Facts the 4B per-spirit rules need (design record, section 9):
--   solera_low_years / solera_high_years: a solera rum's age as a range in years (replaces the free-text solera_range,
--     which stays, dormant, until a later migration drops it);
--   calvados_appellation: AOC Calvados, Pays d'Auge or Domfrontais;
--   brandy_vintage_year: the year of a Millésime / Vintage Armagnac or Calvados;
--   is_mosto_verde: a Peruvian pisco made from partly fermented must (a style, not a grape).
ALTER TABLE expressions
  ADD COLUMN solera_low_years numeric(4,1),
  ADD COLUMN solera_high_years numeric(4,1),
  ADD COLUMN calvados_appellation text,
  ADD COLUMN brandy_vintage_year integer,
  ADD COLUMN is_mosto_verde boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE expressions
  ADD CONSTRAINT expressions_solera_range_check CHECK (solera_low_years IS NULL OR solera_high_years IS NULL OR solera_low_years <= solera_high_years),
  ADD CONSTRAINT expressions_calvados_appellation_check CHECK (calvados_appellation IS NULL OR calvados_appellation IN ('aoc-calvados', 'pays-d-auge', 'domfrontais')),
  ADD CONSTRAINT expressions_brandy_vintage_year_check CHECK (brandy_vintage_year IS NULL OR brandy_vintage_year BETWEEN 1800 AND 2100);
