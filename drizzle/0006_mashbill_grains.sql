-- M7: grains become rows.
--
-- The fixed columns handled exactly one unusual grain, via other_grain plus
-- other_grain_name. A mashbill with oats AND triticale had nowhere to go, and
-- the second one silently lost its name. A child table is the honest answer.
--
-- The 99–101 tolerance survives as a DEFERRABLE constraint trigger rather than
-- a CHECK: a CHECK sees one row at a time, and editing a recipe necessarily
-- passes through totals that are not 100. Deferring to commit means the
-- intermediate states are fine and the committed state never is not.

CREATE TABLE mashbill_grains (
    id          serial PRIMARY KEY,
    mashbill_id integer NOT NULL REFERENCES mashbills(id) ON DELETE CASCADE,
    grain       text    NOT NULL,
    percent     numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
    -- The order the recipe was entered in. Display sorts by percent instead,
    -- so this is only the tiebreak — see describeMashbill.
    position    integer NOT NULL DEFAULT 0,
    UNIQUE (mashbill_id, grain)
);

CREATE INDEX mashbill_grains_mashbill_idx ON mashbill_grains(mashbill_id);

-- Carry the six columns over as rows, skipping the zeroes. other_grain takes
-- its name from other_grain_name, which is exactly what that column was for.
INSERT INTO mashbill_grains (mashbill_id, grain, percent, position)
SELECT m.id, g.grain, g.percent, g.position
  FROM mashbills m
  CROSS JOIN LATERAL (VALUES
    ('Corn',           m.corn,          0),
    ('Rye',            m.rye,           1),
    ('Wheat',          m.wheat,         2),
    ('Malted Barley',  m.malted_barley, 3),
    ('Malted Rye',     m.malted_rye,    4),
    (coalesce(nullif(btrim(m.other_grain_name), ''), 'Other'), m.other_grain, 5)
  ) AS g(grain, percent, position)
 WHERE g.percent > 0;

ALTER TABLE mashbills DROP CONSTRAINT mashbill_sums_to_100;

ALTER TABLE mashbills
    DROP COLUMN corn,
    DROP COLUMN rye,
    DROP COLUMN wheat,
    DROP COLUMN malted_barley,
    DROP COLUMN malted_rye,
    DROP COLUMN other_grain,
    DROP COLUMN other_grain_name;

-- Published mashbills are often rounded, so 99–101 stays the tolerance.
-- A mashbill with no grains at all is allowed: that is a recipe you know the
-- name of but not the contents, which is a real thing to want to record.
CREATE FUNCTION mashbill_grains_sum_to_100() RETURNS trigger AS $$
DECLARE
    target integer := coalesce(NEW.mashbill_id, OLD.mashbill_id);
    total  numeric;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mashbills WHERE id = target) THEN
        RETURN NULL;  -- the mashbill itself was deleted; nothing to check
    END IF;
    SELECT coalesce(sum(percent), 0) INTO total FROM mashbill_grains WHERE mashbill_id = target;
    IF total <> 0 AND (total < 99.0 OR total > 101.0) THEN
        RAISE EXCEPTION 'mashbill grains must add up to 100%% (got %)', total
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER mashbill_grains_sum_check
    AFTER INSERT OR UPDATE OR DELETE ON mashbill_grains
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION mashbill_grains_sum_to_100();
