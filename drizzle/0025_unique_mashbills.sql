-- Grain names typed in lowercase ("corn", "malted barley") are title-cased,
-- as the form now does on save. Mixed case was a choice and is left alone; a
-- mashbill that somehow holds both "corn" and "Corn" keeps its lowercase row
-- rather than break the (mashbill_id, grain) unique key.
UPDATE "mashbill_grains" g
   SET "grain" = initcap(g."grain")
 WHERE g."grain" = lower(g."grain")
   AND g."grain" <> initcap(g."grain")
   AND NOT EXISTS (
     SELECT 1 FROM "mashbill_grains" o
      WHERE o."mashbill_id" = g."mashbill_id" AND o."id" <> g."id" AND o."grain" = initcap(g."grain")
   );
--> statement-breakpoint
-- A secret or generic mashbill is known by its name, so two with the same name
-- are one mashbill twice. Any already there are numbered rather than merged:
-- their recipes and notes may differ, and choosing between them is the
-- owner's call. The oldest keeps the name.
UPDATE "mashbills" m
   SET "name" = m."name" || ' (' || d.n || ')'
  FROM (
    SELECT "id", row_number() OVER (PARTITION BY "owner_id", "name" ORDER BY "id") AS n
      FROM "mashbills"
     WHERE "is_secret" OR "is_generic"
  ) d
 WHERE d."id" = m."id" AND d.n > 1;
--> statement-breakpoint
-- Recipes live in mashbill_grains, which no index can compare across rows;
-- the app checks those on save.
CREATE UNIQUE INDEX "mashbills_owner_name_unique" ON "mashbills" ("owner_id", "name") WHERE "is_secret" OR "is_generic";
