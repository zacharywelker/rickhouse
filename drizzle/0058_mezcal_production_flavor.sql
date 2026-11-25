-- Mezcal's production category (Mezcal, Artesanal, Ancestral) and how it was flavored (Abocado con, Destilado con),
-- design record section 9. Both are text with CHECKs, empty unless stated; the flavors themselves are ingredient links.
ALTER TABLE expressions
  ADD COLUMN mezcal_production text,
  ADD COLUMN mezcal_flavor_method text;
--> statement-breakpoint
ALTER TABLE expressions
  ADD CONSTRAINT expressions_mezcal_production_check CHECK (mezcal_production IS NULL OR mezcal_production IN ('mezcal', 'artesanal', 'ancestral')),
  ADD CONSTRAINT expressions_mezcal_flavor_method_check CHECK (mezcal_flavor_method IS NULL OR mezcal_flavor_method IN ('abocado-con', 'destilado-con'));
