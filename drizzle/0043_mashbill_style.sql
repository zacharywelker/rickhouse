ALTER TABLE "mashbills" ADD COLUMN "style" citext;
--> statement-breakpoint
UPDATE "mashbills"
SET "style" = CASE lower(regexp_replace("name", '(^|[[:space:](])(Wheated|Low[[:space:]]+Rye|High[[:space:]]+Rye|High[[:space:]]+Wheat|Four[[:space:]]+Grain)[)]?[.!]?$', '\2', 'i'))
  WHEN 'wheated' THEN 'Wheated'
  WHEN 'low rye' THEN 'Low Rye'
  WHEN 'high rye' THEN 'High Rye'
  WHEN 'high wheat' THEN 'High Wheat'
  WHEN 'four grain' THEN 'Four Grain'
  ELSE NULL
END
WHERE "name" ~* '(^|[[:space:](])(Wheated|Low[[:space:]]+Rye|High[[:space:]]+Rye|High[[:space:]]+Wheat|Four[[:space:]]+Grain)[)]?[.!]?$';
