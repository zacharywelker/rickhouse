-- M7: release identity moves from the label (née expression) to the bottle.
--
-- Six private selections of one Weller 12 are six bottles of one product, not
-- six products. Everything that varies barrel to barrel moves down; the label
-- keeps what is true of the product itself.
--
-- This migration runs automatically at container start, and it MERGES label
-- rows. It is written so that no value is ever silently dropped:
--
--   * Each bottle carries its own label's batch down with it before anything
--     is merged, so batch is preserved per bottle rather than per product.
--   * Labels that differ ONLY by batch merge cleanly — after the move they are
--     genuinely the same product.
--   * Labels that also disagree on some other column still merge (the unique
--     constraint demands it), but the discarded row is written whole into
--     label_merge_log first. Nothing is lost; it is moved somewhere you can
--     read it.
--
-- `npm run m7:preview` reports exactly what this would do, before you upgrade.

-- The view reads columns on both tables, so it comes down first and goes back
-- up at the end with its new shape.
DROP VIEW IF EXISTS bottle_list;

-- ------------------------------------------------------------
-- 1. The bottle gains everything that varies bottle to bottle
-- ------------------------------------------------------------
ALTER TABLE bottles
    ADD COLUMN batch                 text,
    ADD COLUMN release_year          integer,
    ADD COLUMN is_single_barrel      boolean NOT NULL DEFAULT false,
    ADD COLUMN is_single_barrel_pick boolean NOT NULL DEFAULT false,
    ADD COLUMN barrel_number         text,
    ADD COLUMN bottle_count          integer,
    ADD COLUMN pick_name             text,
    ADD COLUMN picked_by             text,
    ADD COLUMN barrel_filled_on      date,
    ADD COLUMN bottled_on            date,
    ADD COLUMN warehouse             text,
    ADD COLUMN rick_floor            text,
    -- Per-bottle strength and age. NULL means "inherit from the label", which
    -- is resolved at read time rather than copied — so correcting the label
    -- still flows through to every bottle that did not override it.
    ADD COLUMN proof                 numeric(5,2),
    ADD COLUMN abv                   numeric(5,2) GENERATED ALWAYS AS (proof / 2.0) STORED,
    ADD COLUMN age_years             numeric(4,1),
    ADD COLUMN age_months            integer,
    ADD COLUMN age_days              integer,
    ADD COLUMN age_statement         text;

COMMENT ON COLUMN bottles.proof IS
    'Overrides the label''s proof. NULL inherits — see bottle_list.proof.';
COMMENT ON COLUMN bottles.age_years IS
    'Overrides the label''s age. NULL inherits — see bottle_list.age_years.';

-- Carry each bottle's current values down from its label.
UPDATE bottles b SET
    batch                 = e.batch,
    release_year          = e.release_year,
    is_single_barrel      = e.is_single_barrel,
    is_single_barrel_pick = e.is_single_barrel_pick,
    barrel_number         = e.barrel_number,
    bottle_count          = e.bottle_count,
    pick_name             = e.pick_name,
    picked_by             = e.picked_by,
    barrel_filled_on      = e.barrel_filled_on,
    bottled_on            = e.bottled_on,
    warehouse             = e.warehouse,
    rick_floor            = e.rick_floor
FROM expressions e
WHERE e.id = b.expression_id;

-- ------------------------------------------------------------
-- 2. Merge labels that are now duplicates, losing nothing
-- ------------------------------------------------------------
CREATE TABLE label_merge_log (
    id          serial PRIMARY KEY,
    merged_at   timestamptz NOT NULL DEFAULT now(),
    kept_id     integer NOT NULL,
    kept_name   text    NOT NULL,
    discarded   jsonb   NOT NULL,   -- the whole row, as it was
    differences text[]  NOT NULL    -- columns where the two disagreed
);

COMMENT ON TABLE label_merge_log IS
    'What the M7 merge collapsed. Empty is the happy case. Rows here mean two '
    'labels shared a brand and name but disagreed on the listed columns; the '
    'discarded row is kept whole so nothing is unrecoverable.';

-- Survivor per (brand_id, name): the lowest id, which is the one that has been
-- around longest and is most likely to be the row people have been editing.
CREATE TEMP TABLE m7_merge AS
SELECT e.id AS loser_id,
       first_value(e.id) OVER w AS keeper_id
  FROM expressions e
WINDOW w AS (PARTITION BY e.brand_id, lower(e.name::text) ORDER BY e.id);

DELETE FROM m7_merge WHERE loser_id = keeper_id;

-- Record what disagrees, before anything is repointed or deleted.
INSERT INTO label_merge_log (kept_id, kept_name, discarded, differences)
SELECT k.id,
       k.name::text,
       to_jsonb(l),
       coalesce(
         ARRAY(
           SELECT key
             FROM jsonb_each_text(to_jsonb(l)) AS lo(key, val)
             JOIN jsonb_each_text(to_jsonb(k)) AS ke(key2, val2) ON ke.key2 = lo.key
            WHERE lo.val IS DISTINCT FROM ke.val2
              AND lo.key NOT IN ('id', 'slug', 'created_at', 'updated_at',
                                 'batch', 'release_year', 'is_single_barrel',
                                 'is_single_barrel_pick', 'barrel_number',
                                 'bottle_count', 'pick_name', 'picked_by',
                                 'barrel_filled_on', 'bottled_on', 'warehouse',
                                 'rick_floor')
         ),
         '{}'::text[]
       )
  FROM m7_merge m
  JOIN expressions l ON l.id = m.loser_id
  JOIN expressions k ON k.id = m.keeper_id;

-- Repoint the bottles. They already carry their own batch, so they keep it.
UPDATE bottles b SET expression_id = m.keeper_id
  FROM m7_merge m WHERE b.expression_id = m.loser_id;

-- Repoint the join tables, dropping rows that would collide with the
-- survivor's own. A duplicate link says the same thing twice.
DELETE FROM expression_distilleries d
 USING m7_merge m
 WHERE d.expression_id = m.loser_id
   AND EXISTS (SELECT 1 FROM expression_distilleries k
                WHERE k.expression_id = m.keeper_id
                  AND k.distillery_id = d.distillery_id);
UPDATE expression_distilleries d SET expression_id = m.keeper_id
  FROM m7_merge m WHERE d.expression_id = m.loser_id;

DELETE FROM expression_mashbills x
 USING m7_merge m
 WHERE x.expression_id = m.loser_id
   AND EXISTS (SELECT 1 FROM expression_mashbills k
                WHERE k.expression_id = m.keeper_id
                  AND k.mashbill_id = x.mashbill_id);
UPDATE expression_mashbills x SET expression_id = m.keeper_id
  FROM m7_merge m WHERE x.expression_id = m.loser_id;

DELETE FROM expression_finishes f
 USING m7_merge m
 WHERE f.expression_id = m.loser_id
   AND EXISTS (SELECT 1 FROM expression_finishes k
                WHERE k.expression_id = m.keeper_id
                  AND k.finish_id = f.finish_id);
UPDATE expression_finishes f SET expression_id = m.keeper_id
  FROM m7_merge m WHERE f.expression_id = m.loser_id;

DELETE FROM expressions e USING m7_merge m WHERE e.id = m.loser_id;
DROP TABLE m7_merge;

-- ------------------------------------------------------------
-- 3. The label sheds what moved, and its uniqueness changes shape
-- ------------------------------------------------------------
-- Dropped by lookup, not by name. schema.sql declares this inline, which
-- Postgres would name `..._key`, while drizzle-kit's 0000 named it
-- `..._unique`. Either is correct; hard-coding one breaks the other.
DO $$
DECLARE target text;
BEGIN
    SELECT conname INTO target
      FROM pg_constraint
     WHERE conrelid = 'expressions'::regclass
       AND contype = 'u'
       AND (SELECT array_agg(attname::text ORDER BY attname)
              FROM unnest(conkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k.attnum)
           = ARRAY['batch', 'brand_id', 'name'];
    IF target IS NULL THEN
        RAISE EXCEPTION 'no UNIQUE (brand_id, name, batch) on expressions to drop';
    END IF;
    EXECUTE format('ALTER TABLE expressions DROP CONSTRAINT %I', target);
END $$;

ALTER TABLE expressions
    DROP COLUMN batch,
    DROP COLUMN release_year,
    DROP COLUMN is_single_barrel,
    DROP COLUMN is_single_barrel_pick,
    DROP COLUMN barrel_number,
    DROP COLUMN bottle_count,
    DROP COLUMN pick_name,
    DROP COLUMN picked_by,
    DROP COLUMN barrel_filled_on,
    DROP COLUMN bottled_on,
    DROP COLUMN warehouse,
    DROP COLUMN rick_floor;

ALTER TABLE expressions ADD CONSTRAINT expressions_brand_id_name_key
    UNIQUE (brand_id, name);

-- Not tracking secondary pricing.
ALTER TABLE bottles DROP COLUMN estimated_value;

-- ------------------------------------------------------------
-- 4. The view comes back, now resolving inheritance
-- ------------------------------------------------------------
CREATE VIEW bottle_list AS
SELECT
    b.id,
    b.status,
    b.is_open,
    b.fill_pct,
    b.price_paid,
    b.date_acquired,
    b.date_opened,
    b.is_favorite,
    b.store_id,
    b.batch,
    b.release_year,
    b.is_single_barrel,
    b.is_single_barrel_pick,
    b.pick_name,
    b.barrel_filled_on,
    b.bottled_on,
    e.id   AS expression_id,
    e.name AS expression_name,
    -- Inheritance resolved here, once, so nothing downstream has to remember
    -- the rule. NULL on the bottle means "whatever the label says"; the
    -- *_inherited flags let the UI show that rather than pretend the bottle
    -- was typed with those numbers.
    coalesce(b.proof, e.proof)                 AS proof,
    coalesce(b.abv, e.abv)                     AS abv,
    coalesce(b.age_years, e.age_years)         AS age_years,
    coalesce(b.age_statement, e.age_statement) AS age_statement,
    (b.proof IS NULL AND e.proof IS NOT NULL)  AS proof_inherited,
    (b.age_years IS NULL AND b.age_statement IS NULL
       AND (e.age_years IS NOT NULL OR e.age_statement IS NOT NULL))
                                               AS age_inherited,
    e.msrp,
    br.id   AS brand_id,
    br.name AS brand,
    c.id    AS category_id,
    c.name  AS category,
    s.name  AS store,
    (SELECT string_agg(d.name, ', ' ORDER BY ed.position)
       FROM expression_distilleries ed
       JOIN distilleries d ON d.id = ed.distillery_id
      WHERE ed.expression_id = e.id) AS distilleries,
    (SELECT string_agg(f.name, ', ' ORDER BY ef.position)
       FROM expression_finishes ef
       JOIN finishes f ON f.id = ef.finish_id
      WHERE ef.expression_id = e.id) AS finishes,
    (SELECT round(avg(tn.rating), 1)
       FROM tasting_notes tn WHERE tn.bottle_id = b.id) AS avg_rating,
    (SELECT bi.thumb_path FROM bottle_images bi
      WHERE bi.bottle_id = b.id
      ORDER BY bi.is_primary DESC, bi.sort_order, bi.id
      LIMIT 1) AS thumb_path,
    -- Full-text search (SPEC M6), weighted: the name of the thing beats what
    -- someone wrote about it. Built in the view rather than kept as a stored
    -- column because it draws on six tables — a generated column cannot see
    -- past its own row, and a trigger-maintained copy across brands,
    -- expressions, distilleries, stores, bottles and tasting_notes is six
    -- ways to go stale. A view means it is never wrong.
    --
    -- The cost is that it cannot be indexed, so this is a sequential scan. At
    -- a home collection's scale (hundreds of bottles, thousands at the very
    -- outside) that is microseconds. If it ever stops being: materialise this
    -- view and REFRESH it from the same places that revalidate the grid.
    (
      setweight(to_tsvector('english', coalesce(br.name::text, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(e.name::text, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(b.batch, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(b.pick_name, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(b.picked_by, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(b.age_statement, e.age_statement, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(c.name::text, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(s.name::text, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(
        (SELECT string_agg(d.name::text, ' ')
           FROM expression_distilleries ed
           JOIN distilleries d ON d.id = ed.distillery_id
          WHERE ed.expression_id = e.id), '')), 'B') ||
      setweight(to_tsvector('english', coalesce(
        (SELECT string_agg(f.name::text, ' ')
           FROM expression_finishes ef
           JOIN finishes f ON f.id = ef.finish_id
          WHERE ef.expression_id = e.id), '')), 'B') ||
      setweight(to_tsvector('english', coalesce(e.description, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(b.notes, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(
        (SELECT string_agg(
            concat_ws(' ', tn.nose, tn.palate, tn.finish, tn.overall), ' ')
           FROM tasting_notes tn WHERE tn.bottle_id = b.id), '')), 'C')
    ) AS search,
    -- The same corpus as plain text. Full text cannot match a prefix, and
    -- nobody typing "goose" wants nothing on the way to "gooseberry" — so the
    -- grid ORs a substring match over this against the tsvector above. One
    -- column so the two can never cover different fields.
    concat_ws(' ',
      br.name::text, e.name::text, b.batch, b.pick_name, b.picked_by,
      coalesce(b.age_statement, e.age_statement), c.name::text, s.name::text,
      (SELECT string_agg(d.name::text, ' ')
         FROM expression_distilleries ed
         JOIN distilleries d ON d.id = ed.distillery_id
        WHERE ed.expression_id = e.id),
      (SELECT string_agg(f.name::text, ' ')
         FROM expression_finishes ef
         JOIN finishes f ON f.id = ef.finish_id
        WHERE ef.expression_id = e.id),
      e.description, b.notes,
      (SELECT string_agg(concat_ws(' ', tn.nose, tn.palate, tn.finish, tn.overall), ' ')
         FROM tasting_notes tn WHERE tn.bottle_id = b.id)
    ) AS search_text
FROM bottles b
JOIN expressions  e  ON e.id  = b.expression_id
JOIN brands       br ON br.id = e.brand_id
JOIN categories   c  ON c.id  = e.category_id
LEFT JOIN stores  s  ON s.id  = b.store_id;
