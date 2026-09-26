-- Earlier password hashes, so a reset or change cannot bring an old password
-- back. Filled by a trigger rather than the app, so every way a password is
-- set (Better Auth, the setup page, admin resets, the CLI) is covered.
CREATE TABLE "password_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "password_history_user_idx" ON "password_history" ("user_id", "id" DESC);
--> statement-breakpoint
-- Keeps the ten most recent per user; the app checks fewer than that.
CREATE FUNCTION "remember_old_password"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.password IS NOT NULL AND NEW.password IS DISTINCT FROM OLD.password THEN
    INSERT INTO password_history (user_id, password_hash) VALUES (OLD.user_id, OLD.password);
    DELETE FROM password_history
      WHERE user_id = OLD.user_id
        AND id NOT IN (SELECT id FROM password_history WHERE user_id = OLD.user_id ORDER BY id DESC LIMIT 10);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "accounts_remember_old_password" AFTER UPDATE OF "password" ON "accounts" FOR EACH ROW EXECUTE FUNCTION "remember_old_password"();
