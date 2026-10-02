-- Every location is a city, a state and a country, kept and shown the same way.
-- Distilleries already were; companies had only a country, and stores one free
-- text "Louisville, KY" box, which is split here as best it can be.
--
-- Spellings are tidied to match what the app now saves: "us" and "United
-- States" become USA, and a US state's abbreviation becomes its full name.
CREATE TEMP TABLE "us_states" ("code" text PRIMARY KEY, "name" text NOT NULL) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO "us_states" ("code", "name") VALUES
	('AL', 'Alabama'), ('AK', 'Alaska'), ('AZ', 'Arizona'), ('AR', 'Arkansas'), ('CA', 'California'),
	('CO', 'Colorado'), ('CT', 'Connecticut'), ('DE', 'Delaware'), ('DC', 'District of Columbia'),
	('FL', 'Florida'), ('GA', 'Georgia'), ('HI', 'Hawaii'), ('ID', 'Idaho'), ('IL', 'Illinois'),
	('IN', 'Indiana'), ('IA', 'Iowa'), ('KS', 'Kansas'), ('KY', 'Kentucky'), ('LA', 'Louisiana'),
	('ME', 'Maine'), ('MD', 'Maryland'), ('MA', 'Massachusetts'), ('MI', 'Michigan'), ('MN', 'Minnesota'),
	('MS', 'Mississippi'), ('MO', 'Missouri'), ('MT', 'Montana'), ('NE', 'Nebraska'), ('NV', 'Nevada'),
	('NH', 'New Hampshire'), ('NJ', 'New Jersey'), ('NM', 'New Mexico'), ('NY', 'New York'),
	('NC', 'North Carolina'), ('ND', 'North Dakota'), ('OH', 'Ohio'), ('OK', 'Oklahoma'), ('OR', 'Oregon'),
	('PA', 'Pennsylvania'), ('RI', 'Rhode Island'), ('SC', 'South Carolina'), ('SD', 'South Dakota'),
	('TN', 'Tennessee'), ('TX', 'Texas'), ('UT', 'Utah'), ('VT', 'Vermont'), ('VA', 'Virginia'),
	('WA', 'Washington'), ('WV', 'West Virginia'), ('WI', 'Wisconsin'), ('WY', 'Wyoming');
--> statement-breakpoint
CREATE TEMP TABLE "us_aliases" ("alias" text PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO "us_aliases" ("alias") VALUES
	('usa'), ('us'), ('u.s.'), ('u.s.a.'), ('united states'), ('united states of america'), ('america');
--> statement-breakpoint

-- Companies: a city and state beside the country they had.
ALTER TABLE "companies" ADD COLUMN "city" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "state" text;
--> statement-breakpoint

-- Stores: split "City, State, Country" on its commas. One part is a state if it
-- names a US state and a city otherwise; two are a city and then a US state or,
-- failing that, a country ("Edinburgh, Scotland"); three or more end in a state
-- and a country. "Online" is no place at all.
ALTER TABLE "stores" ADD COLUMN "city" text;
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "state" text;
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "country" text;
--> statement-breakpoint
WITH "split" AS (
	SELECT "id", "parts", cardinality("parts") AS "n",
		EXISTS (
			SELECT 1 FROM "us_states"
			WHERE lower("code") = lower("parts"[cardinality("parts")]) OR lower("name") = lower("parts"[cardinality("parts")])
		) AS "ends_in_us_state"
	FROM (
		SELECT "id", array_remove(ARRAY(SELECT btrim("part") FROM unnest(string_to_array("location", ',')) AS "part"), '') AS "parts"
		FROM "stores"
		WHERE "location" IS NOT NULL AND lower(btrim("location")) NOT IN ('', 'online')
	) AS "raw"
)
UPDATE "stores" AS "s" SET
	"city" = CASE
		WHEN "p"."n" >= 3 THEN array_to_string("p"."parts"[1:"p"."n" - 2], ', ')
		WHEN "p"."n" = 2 OR NOT "p"."ends_in_us_state" THEN "p"."parts"[1]
	END,
	"state" = CASE
		WHEN "p"."n" >= 3 THEN "p"."parts"["p"."n" - 1]
		WHEN "p"."ends_in_us_state" THEN "p"."parts"["p"."n"]
	END,
	"country" = CASE
		WHEN "p"."n" >= 3 OR ("p"."n" = 2 AND NOT "p"."ends_in_us_state") THEN "p"."parts"["p"."n"]
	END
FROM "split" AS "p"
WHERE "s"."id" = "p"."id" AND "p"."n" > 0;
--> statement-breakpoint
UPDATE "stores" SET "country" = 'USA' WHERE lower("country") IN (SELECT "alias" FROM "us_aliases");
--> statement-breakpoint
-- A store in a US state is in the US.
UPDATE "stores" SET "country" = 'USA'
WHERE "country" IS NULL
	AND EXISTS (SELECT 1 FROM "us_states" WHERE lower("code") = lower("stores"."state") OR lower("name") = lower("stores"."state"));
--> statement-breakpoint
UPDATE "stores" AS "s" SET "state" = "u"."name"
FROM "us_states" AS "u"
WHERE "s"."country" = 'USA' AND (lower("s"."state") = lower("u"."code") OR lower("s"."state") = lower("u"."name"))
	AND "s"."state" IS DISTINCT FROM "u"."name";
--> statement-breakpoint
-- "Louisville, KY" and "Louisville, Kentucky" were two stores and are now one
-- place. The later one keeps what it said in its notes instead, to be fixed by hand.
UPDATE "stores" AS "s" SET
	"city" = NULL,
	"state" = NULL,
	"country" = NULL,
	"notes" = concat_ws(E'\n\n', "s"."notes", 'Location: ' || "s"."location")
WHERE EXISTS (
	SELECT 1 FROM "stores" AS "o"
	WHERE "o"."owner_id" = "s"."owner_id" AND "o"."name" = "s"."name" AND "o"."id" < "s"."id"
		AND "o"."city" = "s"."city" AND "o"."state" = "s"."state" AND "o"."country" = "s"."country"
);
--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_owner_name_location_unique";
--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "location";
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_name_place_unique" UNIQUE ("owner_id", "name", "city", "state", "country");
--> statement-breakpoint

-- One spelling for the US and its states, everywhere.
UPDATE "companies" SET "country" = 'USA' WHERE lower(btrim("country")) IN (SELECT "alias" FROM "us_aliases");
--> statement-breakpoint
UPDATE "distilleries" SET "country" = 'USA' WHERE lower(btrim("country")) IN (SELECT "alias" FROM "us_aliases");
--> statement-breakpoint
UPDATE "distilleries" AS "d" SET "state" = "u"."name"
FROM "us_states" AS "u"
WHERE "d"."country" = 'USA' AND (lower(btrim("d"."state")) = lower("u"."code") OR lower(btrim("d"."state")) = lower("u"."name"))
	AND "d"."state" IS DISTINCT FROM "u"."name";
