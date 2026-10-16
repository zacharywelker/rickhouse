-- Tournaments (docs/superpowers/specs/2026-10-13-tournament-design.md): a saved, resumable set of tastings in
-- flights ("heats") that ranks bottles by preference and audits the 0 to 10 ratings. A tournament has entries
-- (a bottle, a label with no bottle, or an ad hoc name), and its heats hold entries with the place each took.
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"heat_size" smallint NOT NULL,
	"seeding" text DEFAULT 'similar' NOT NULL,
	-- What flights are matched on, highest priority first: each of the five keys exactly once.
	"group_order" text[] DEFAULT '{proof,mashbill,distillery,age,finish}' NOT NULL,
	"blind" boolean DEFAULT false NOT NULL,
	"field_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tournaments_status_check" CHECK ("status" IN ('draft', 'active', 'complete')),
	CONSTRAINT "tournaments_heat_size_check" CHECK ("heat_size" BETWEEN 2 AND 4),
	CONSTRAINT "tournaments_seeding_check" CHECK ("seeding" IN ('similar', 'random')),
	CONSTRAINT "tournaments_group_order_check" CHECK (
		cardinality("group_order") = 5 AND "group_order" @> ARRAY['proof', 'mashbill', 'distillery', 'age', 'finish']
	),
	CONSTRAINT "tournaments_id_owner_unique" UNIQUE ("id", "owner_id"),
	CONSTRAINT "tournaments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "tournaments_owner_idx" ON "tournaments" ("owner_id", "created_at" DESC);
--> statement-breakpoint
-- An entry is a bottle (bottle_id and its label), a label with no bottle (expression_id only), or ad hoc (neither).
-- display_name is a snapshot, so the history still reads right after a bottle or label is deleted. Deleting a bottle
-- leaves its entry on the label; deleting a label leaves an ad hoc entry.
CREATE TABLE "tournament_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"bottle_id" integer,
	"expression_id" integer,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"seed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tournament_entries_status_check" CHECK ("status" IN ('active', 'withdrawn')),
	CONSTRAINT "tournament_entries_id_tournament_unique" UNIQUE ("id", "tournament_id"),
	CONSTRAINT "tournament_entries_tournament_fk" FOREIGN KEY ("tournament_id", "owner_id") REFERENCES "tournaments"("id", "owner_id") ON DELETE CASCADE,
	CONSTRAINT "tournament_entries_expression_fk" FOREIGN KEY ("expression_id", "owner_id") REFERENCES "expressions"("id", "owner_id") ON DELETE SET NULL ("expression_id"),
	CONSTRAINT "tournament_entries_bottle_fk" FOREIGN KEY ("bottle_id", "expression_id") REFERENCES "bottles"("id", "expression_id") ON DELETE SET NULL ("bottle_id")
);
--> statement-breakpoint
CREATE INDEX "tournament_entries_tournament_idx" ON "tournament_entries" ("tournament_id");
--> statement-breakpoint
-- The same bottle cannot enter a tournament twice. (A label with no bottle twice is refused by the API, not here:
-- deleting a bottle turns its entry into a label entry, and that must never fail.)
CREATE UNIQUE INDEX "tournament_entries_bottle_unique" ON "tournament_entries" ("tournament_id", "bottle_id") WHERE "bottle_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "tournament_heats" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"round" smallint NOT NULL,
	"slot" smallint NOT NULL,
	-- Set only when the owner renames the heat; the generated label is computed on read.
	"label" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" integer,
	CONSTRAINT "tournament_heats_round_check" CHECK ("round" >= 1),
	CONSTRAINT "tournament_heats_slot_check" CHECK ("slot" >= 1),
	CONSTRAINT "tournament_heats_status_check" CHECK ("status" IN ('pending', 'decided', 'bye')),
	CONSTRAINT "tournament_heats_round_slot_unique" UNIQUE ("tournament_id", "round", "slot"),
	CONSTRAINT "tournament_heats_id_tournament_unique" UNIQUE ("id", "tournament_id"),
	CONSTRAINT "tournament_heats_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE,
	CONSTRAINT "tournament_heats_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_heat_entries" (
	"heat_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	-- 1 for the best; null until the heat is decided, and always null in a bye.
	"place" smallint,
	-- The glass the entry is poured into in a blind heat.
	"glass" text,
	CONSTRAINT "tournament_heat_entries_pkey" PRIMARY KEY ("heat_id", "entry_id"),
	CONSTRAINT "tournament_heat_entries_place_check" CHECK ("place" >= 1),
	CONSTRAINT "tournament_heat_entries_glass_check" CHECK ("glass" ~ '^[A-D]$'),
	CONSTRAINT "tournament_heat_entries_heat_fk" FOREIGN KEY ("heat_id", "tournament_id") REFERENCES "tournament_heats"("id", "tournament_id") ON DELETE CASCADE,
	CONSTRAINT "tournament_heat_entries_entry_fk" FOREIGN KEY ("entry_id", "tournament_id") REFERENCES "tournament_entries"("id", "tournament_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_heat_entries_place_unique" ON "tournament_heat_entries" ("heat_id", "place") WHERE "place" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_heat_entries_glass_unique" ON "tournament_heat_entries" ("heat_id", "glass") WHERE "glass" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "tournament_heat_entries_entry_idx" ON "tournament_heat_entries" ("entry_id");
