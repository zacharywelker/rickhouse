-- Issue #13: a mashbill recipe is not exclusive to one distillery — the same
-- recipe name gets reused across producers — so "which distillery made this"
-- moves from the mashbill itself to the per-label link. With exactly one
-- distillery on a label that answer is automatic; with more than one, it is
-- picked per mashbill on the label.

ALTER TABLE expression_mashbills
    ADD COLUMN distillery_id integer REFERENCES distilleries(id) ON DELETE SET NULL;

-- Carry forward whatever correlation already existed, so a mashbill that was
-- previously tied to a distillery keeps showing that attribution on any
-- label that already links it.
UPDATE expression_mashbills em
   SET distillery_id = m.distillery_id
  FROM mashbills m
 WHERE m.id = em.mashbill_id
   AND m.distillery_id IS NOT NULL;

ALTER TABLE mashbills DROP COLUMN distillery_id;
