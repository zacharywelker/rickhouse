-- Sign-in attempts through the iOS app's own route (/api/v1/auth/sign-in), which has no Turnstile check, so the
-- guessing itself is slowed instead: after a few attempts an account backs off. `key` is a hash of the lowercased
-- username, kept for names that don't exist too, so a back-off never says whether an account does.
CREATE TABLE "app_sign_in_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "app_sign_in_attempts_last_attempt_idx" ON "app_sign_in_attempts" ("last_attempt_at");
