-- Per-account preferences, chosen on the Configuration page. No row means
-- every default, so a row is written only once something is changed.
-- `search_first_add`: "Add bottle" opens the search-first page that adds a
-- label and its bottle in one save. Off until it has earned being the default.
CREATE TABLE "user_preferences" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"search_first_add" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
