-- Persisted schedule for the in-app backup job (src/lib/backup), so the
-- admin UI can read and change it without touching a config file, and a
-- restart picks the schedule back up from the database it protects.
CREATE TABLE "backup_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_hours" integer DEFAULT 24 NOT NULL,
	"keep" integer DEFAULT 14 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_ok" boolean,
	"last_run_error" text
);
