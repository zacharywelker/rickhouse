-- A generic mashbill is a style, not a recipe: "High Rye", "Wheated". Plenty of
-- labels say no more than that, and a secret mashbill would be the wrong
-- thing to call it — nobody is inferring a recipe. It has no grains, and its
-- name is what shows.
ALTER TABLE "mashbills" ADD COLUMN "is_generic" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "mashbills" ADD CONSTRAINT "mashbills_secret_or_generic_check" CHECK (NOT ("is_secret" AND "is_generic"));
--> statement-breakpoint
-- The styles every account starts with. Ordinary rows the account owns, so
-- they can be renamed, added to or deleted like any other mashbill.
CREATE FUNCTION "seed_generic_mashbills"(account integer) RETURNS void LANGUAGE sql AS $$
  INSERT INTO mashbills (owner_id, name, is_generic)
  SELECT account, style, true
    FROM unnest(ARRAY['High Rye', 'Low Rye', 'Wheated', 'High Wheat', 'Four Grain']) AS style
   WHERE NOT EXISTS (
     SELECT 1 FROM mashbills m WHERE m.owner_id = account AND (m.is_generic OR m.is_secret) AND m.name = style::citext
   );
$$;
--> statement-breakpoint
-- A trigger rather than the app, so every way an account is made (the setup
-- page, the Users page, single sign-on, the CLI) gets them.
CREATE FUNCTION "users_seed_generic_mashbills"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM seed_generic_mashbills(NEW.id);
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "users_seed_generic_mashbills" AFTER INSERT ON "users" FOR EACH ROW EXECUTE FUNCTION "users_seed_generic_mashbills"();
--> statement-breakpoint
SELECT seed_generic_mashbills(id) FROM users;
