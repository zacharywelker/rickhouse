ALTER TABLE mashbills ADD COLUMN is_partial boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mashbill_grains_sum_to_100() RETURNS trigger AS $$
DECLARE
    target integer := coalesce(NEW.mashbill_id, OLD.mashbill_id);
    total numeric;
    partial boolean;
BEGIN
    SELECT is_partial INTO partial FROM mashbills WHERE id = target;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT coalesce(sum(percent), 0) INTO total FROM mashbill_grains WHERE mashbill_id = target;
    IF total <> 0 AND (total > 101.0 OR (NOT partial AND total < 99.0)) THEN
        RAISE EXCEPTION 'mashbill grains exceed allowed total or need 100%% (got %)', total
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
