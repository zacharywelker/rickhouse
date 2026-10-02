-- `currency`: the ISO 4217 code prices are shown and entered in. Display only;
-- stored amounts are never converted.
ALTER TABLE "user_preferences" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;
