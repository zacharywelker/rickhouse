-- A mid-size rendition of each label panel, for showing it large on the
-- label's page without sending the full scan (SPEC M11).
ALTER TABLE "cola_images" ADD COLUMN "display_path" text;
