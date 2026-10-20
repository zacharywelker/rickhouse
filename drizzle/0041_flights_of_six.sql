ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_heat_size_check";
--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_heat_size_check" CHECK ("heat_size" BETWEEN 2 AND 6);
--> statement-breakpoint
ALTER TABLE "tournament_heat_entries" DROP CONSTRAINT "tournament_heat_entries_glass_check";
--> statement-breakpoint
ALTER TABLE "tournament_heat_entries" ADD CONSTRAINT "tournament_heat_entries_glass_check" CHECK ("glass" ~ '^[A-F]$');
