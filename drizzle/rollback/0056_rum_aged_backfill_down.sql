-- Undoes drizzle/0056_rum_aged_backfill.sql. Not run by the migrator; run by hand after a backup.
--
-- Switches the Aged toggle off for every rum label. The migration cannot be told apart from a toggle the owner set
-- afterwards, so rolling back also clears those; the aging facts themselves are not touched, and the old rum form
-- shows them whatever the flag says.
UPDATE expressions e
   SET is_aged = false
  FROM categories c
 WHERE c.id = e.category_id AND c.field_group = 'rum' AND e.is_aged;
