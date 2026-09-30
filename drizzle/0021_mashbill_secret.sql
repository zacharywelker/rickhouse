-- A mashbill is presented as its recipe. A distillery that keeps the recipe
-- secret (Buffalo Trace, for one) is entered as an inferred recipe under a
-- reference name, such as "Buffalo Trace Wheated", and that name is what shows.
-- `name` is now only that reference name, and is shown only when is_secret.
ALTER TABLE "mashbills" ADD COLUMN "is_secret" boolean DEFAULT false NOT NULL;
