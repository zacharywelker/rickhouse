-- A smart group keeps the Collection's filters instead of a hand-picked list:
-- its bottles are whatever the query string matches when the group is opened.
-- NULL is an ordinary group whose bottles live in group_bottles.
ALTER TABLE "groups" ADD COLUMN "filter_query" text;
