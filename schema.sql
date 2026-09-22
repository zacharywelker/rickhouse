-- ============================================================
-- Home spirits collection — Postgres schema
-- Target: PostgreSQL 16+
-- ============================================================
-- Design notes:
--   * EXPRESSION = the product (Pursuit Double Oak Spirit, Batch 2).
--     Mashbill, proof, distillery, MSRP live here.
--   * BOTTLE = the physical unit on your shelf.
--     Price paid, store, date acquired, fill level, open/closed live here.
--     Buying a second one = a second row in `bottles`, same expression.
--   * Distilleries, mashbills and finishes are MANY-TO-MANY with expressions,
--     because blends (like the Pursuit example) have several of each.
--   * Rum / agave / other category-specific fields are nullable columns on
--     `expressions`, shown conditionally in the UI. Do NOT add a second table
--     per spirit type, and do NOT use JSONB — sparse columns are simpler to
--     query, index and render at home-collection scale.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ------------------------------------------------------------
-- Taxonomy
-- ------------------------------------------------------------

-- Self-referencing so you get Whiskey > American Whiskey > Bourbon > Straight
-- Bourbon, and later Rum > Jamaican > Pot Still, in one structure.
CREATE TABLE categories (
    id          serial PRIMARY KEY,
    name        citext NOT NULL,
    slug        text   NOT NULL UNIQUE,
    parent_id   integer REFERENCES categories(id) ON DELETE SET NULL,
    -- Drives which conditional fields the UI shows. One of:
    -- 'whiskey' | 'rum' | 'agave' | 'brandy' | 'gin' | 'vodka' | 'liqueur' | 'other'
    field_group text   NOT NULL DEFAULT 'other',
    sort_order  integer NOT NULL DEFAULT 0,
    UNIQUE (name, parent_id)
);
CREATE INDEX categories_parent_idx ON categories(parent_id);

-- Parent companies. Self-referencing for ownership chains:
-- Brown-Forman -> Old Forester. Pursuit Spirits is its own parent.
CREATE TABLE companies (
    id          serial PRIMARY KEY,
    name        citext NOT NULL UNIQUE,
    slug        text   NOT NULL UNIQUE,
    parent_id   integer REFERENCES companies(id) ON DELETE SET NULL,
    country     text,
    website     text,
    notes       text
);
CREATE INDEX companies_parent_idx ON companies(parent_id);

CREATE TABLE brands (
    id          serial PRIMARY KEY,
    name        citext NOT NULL UNIQUE,
    slug        text   NOT NULL UNIQUE,
    company_id  integer REFERENCES companies(id) ON DELETE SET NULL,
    -- Non-distiller producer: sources whiskey rather than distilling it.
    is_ndp      boolean NOT NULL DEFAULT false,
    notes       text
);
CREATE INDEX brands_company_idx ON brands(company_id);

CREATE TABLE distilleries (
    id          serial PRIMARY KEY,
    name        citext NOT NULL UNIQUE,
    slug        text   NOT NULL UNIQUE,
    company_id  integer REFERENCES companies(id) ON DELETE SET NULL,
    city        text,
    state       text,
    country     text NOT NULL DEFAULT 'USA',
    dsp_number  text,          -- e.g. DSP-KY-95
    founded     integer,
    notes       text
);
CREATE INDEX distilleries_company_idx ON distilleries(company_id);

-- Mashbills are reusable entities so you can ask "everything using this recipe" --
-- reused across distilleries on purpose, since the same recipe name gets used by
-- more than one producer. Which distillery supplied it belongs to the label's
-- blend, not the recipe, so that link lives on expression_mashbills instead.
-- Percentages should sum to 100; enforced in app, checked loosely here.
CREATE TABLE mashbills (
    id              serial PRIMARY KEY,
    name            citext,                    -- "BBC High Rye", optional
    notes           text
)

CREATE TABLE finishes (
    id          serial PRIMARY KEY,
    name        citext NOT NULL UNIQUE,   -- French Oak, PX Sherry, Maple, Toasted
    slug        text   NOT NULL UNIQUE,
    -- 'wood' | 'wine' | 'fortified' | 'beer' | 'spirit' | 'other'
    finish_type text   NOT NULL DEFAULT 'other',
    notes       text
);

CREATE TABLE stores (
    id          serial PRIMARY KEY,
    name        citext NOT NULL,
    slug        text   NOT NULL UNIQUE,
    location    text,                      -- "Online", "Louisville, KY"
    is_online   boolean NOT NULL DEFAULT false,
    url         text,
    notes       text,
    UNIQUE (name, location)
);

-- ------------------------------------------------------------
-- Expressions (the product)
-- ------------------------------------------------------------

-- Grains as rows rather than fixed columns (M7). The old shape handled
-- exactly one unusual grain, through other_grain + other_grain_name, so a
-- recipe with both oats and triticale lost the second one's name.
CREATE TABLE mashbill_grains (
    id          serial PRIMARY KEY,
    mashbill_id integer NOT NULL REFERENCES mashbills(id) ON DELETE CASCADE,
    grain       text    NOT NULL,              -- "Corn", "Rye", "Oats"
    percent     numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
    -- The order it was entered in. Display sorts by percent instead, so this
    -- is only the tiebreak.
    position    integer NOT NULL DEFAULT 0,
    UNIQUE (mashbill_id, grain)
);

CREATE INDEX mashbill_grains_mashbill_idx ON mashbill_grains(mashbill_id);

-- Published mashbills are often rounded, so 99-101 is the tolerance. This is
-- a DEFERRABLE constraint trigger, not a CHECK: a CHECK sees one row at a
-- time, and editing a recipe necessarily passes through totals that are not
-- 100. Deferring to commit lets the intermediate states be wrong and the
-- committed state never be. A mashbill with no grains at all is allowed —
-- that is a recipe you know the name of but not the contents.
CREATE FUNCTION mashbill_grains_sum_to_100() RETURNS trigger AS $$
DECLARE
    target integer := coalesce(NEW.mashbill_id, OLD.mashbill_id);
    total  numeric;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mashbills WHERE id = target) THEN
        RETURN NULL;
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

CREATE TABLE expressions (
    id              serial PRIMARY KEY,
    brand_id        integer NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    category_id     integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name            citext  NOT NULL,          -- "Double Oak Spirit"
    slug            text    NOT NULL UNIQUE,

    -- Strength, as the product is normally sold. A bottle may override it.
    proof           numeric(5,2),
    abv             numeric(5,2) GENERATED ALWAYS AS (proof / 2.0) STORED,
    is_cask_strength boolean NOT NULL DEFAULT false,
    is_bottled_in_bond boolean NOT NULL DEFAULT false,

    -- Age, as the product is normally sold. A bottle may override it.
    -- NULL age_years = NAS; age_statement carries the human text.
    age_years       numeric(4,1),
    age_months      integer,
    age_days        integer,
    age_statement   text,                      -- "NAS (Straight, so >= 2 years)"
    -- Designations that imply a minimum age. Checking one fills in
    -- age_statement when blank, without clobbering a more specific one
    -- already typed (Old Grand Dad 7 is bottled-in-bond but reads "7 Year").
    is_straight     boolean NOT NULL DEFAULT false,
    is_nas          boolean NOT NULL DEFAULT false,

    -- Process
    is_chill_filtered boolean,
    color_added     boolean,
    entry_proof     numeric(5,2),
    char_level      text,

    msrp            numeric(10,2),
    size_ml         integer NOT NULL DEFAULT 750,
    upc             text,
    label_notes     text,
    description     text,

    -- ---- Rum-specific (nullable; shown when category.field_group = 'rum')
    still_type      text,      -- 'pot' | 'column' | 'blend' | 'coffey'
    estate          text,      -- Hampden, Foursquare, Worthy Park
    marque          text,      -- LROK, DOK, <>H
    ester_gl        numeric(8,2),
    sugar_g_per_l   numeric(6,2),
    is_solera       boolean,
    solera_range    text,
    tropical_years  numeric(4,1),
    continental_years numeric(4,1),
    molasses_or_cane text,     -- 'molasses' | 'cane juice' | 'honey'

    -- ---- Agave-specific
    agave_type      text,
    agave_region    text,
    cooking_method  text,      -- 'brick oven' | 'autoclave' | 'pit'
    extraction      text,      -- 'tahona' | 'roller mill'
    is_additive_free boolean,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (brand_id, name)
);
CREATE INDEX expressions_brand_idx    ON expressions(brand_id);
CREATE INDEX expressions_category_idx ON expressions(category_id);
-- Barcode lookup: scan a bottle and jump straight to its expression.
-- Deliberately NOT unique; relabels and regional variants share codes.
CREATE INDEX expressions_upc_idx      ON expressions(upc) WHERE upc IS NOT NULL;

-- Many-to-many joins. `position` preserves the order you'd list them in.
CREATE TABLE expression_distilleries (
    expression_id integer NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
    distillery_id integer NOT NULL REFERENCES distilleries(id) ON DELETE CASCADE,
    position      integer NOT NULL DEFAULT 0,
    share_pct     numeric(5,2),
    PRIMARY KEY (expression_id, distillery_id)
);

CREATE TABLE expression_mashbills (
    expression_id integer NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
    mashbill_id   integer NOT NULL REFERENCES mashbills(id) ON DELETE CASCADE,
    position      integer NOT NULL DEFAULT 0,
    share_pct     numeric(5,2),
    -- Which of the label's distilleries made this mashbill. Only meaningful,
    -- and only ever set, when the label has more than one distillery; with
    -- exactly one, that distillery is the automatic answer and this is NULL.
    distillery_id integer REFERENCES distilleries(id) ON DELETE SET NULL,
    PRIMARY KEY (expression_id, mashbill_id)
);

CREATE TABLE expression_finishes (
    expression_id integer NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
    finish_id     integer NOT NULL REFERENCES finishes(id) ON DELETE CASCADE,
    position      integer NOT NULL DEFAULT 0,   -- sequence for double finishes
    months        integer,
    PRIMARY KEY (expression_id, finish_id)
);

-- ------------------------------------------------------------
-- Bottles (the physical unit)
-- ------------------------------------------------------------

CREATE TABLE bottles (
    id              serial PRIMARY KEY,
    expression_id   integer NOT NULL REFERENCES expressions(id) ON DELETE RESTRICT,

    -- ---- Release identity (M7).
    -- These live here, not on the label, because they vary barrel to barrel.
    -- Six private selections of one Weller 12 are six bottles of one product,
    -- not six products — putting them on the label forced a duplicate product
    -- per pick, which is the duplication the label/bottle split exists to stop.
    batch           text,                      -- "Batch 2", "B524"
    release_year    integer,
    is_single_barrel      boolean NOT NULL DEFAULT false,
    is_single_barrel_pick boolean NOT NULL DEFAULT false,
    barrel_number   text,
    bottle_count    integer,                   -- total bottles in the release
    pick_name       text,                      -- store pick / society pick label
    picked_by       text,      -- the group that picked it: club, bar, society
    barrel_filled_on date,     -- fill/bottling dates give the exact age
    bottled_on      date,
    warehouse       text,      -- rickhouse identifier, e.g. "Warehouse H"
    rick_floor      text,      -- floor / rick position, e.g. "5th floor, rick 12"

    -- ---- Overrides. NULL means "inherit from the label", resolved at read
    -- time in bottle_list rather than copied on save — so correcting the
    -- label still flows through to every bottle that did not override it.
    -- A single barrel almost always differs on exactly these two.
    proof           numeric(5,2),
    abv             numeric(5,2) GENERATED ALWAYS AS (proof / 2.0) STORED,
    age_years       numeric(4,1),
    age_months      integer,
    age_days        integer,
    age_statement   text,

    -- Acquisition
    price_paid      numeric(10,2),
    store_id        integer REFERENCES stores(id) ON DELETE SET NULL,
    date_acquired   date,
    -- 'purchase' | 'gift' | 'trade' | 'allocation' | 'lottery' | 'secondary'
    acquisition     text NOT NULL DEFAULT 'purchase',
    acquisition_notes text,

    -- State
    is_open         boolean NOT NULL DEFAULT false,
    date_opened     date,
    fill_pct        smallint NOT NULL DEFAULT 100
                    CHECK (fill_pct BETWEEN 0 AND 100),
    date_killed     date,
    -- 'owned' | 'open' | 'killed' | 'sold' | 'traded' | 'wishlist' | 'sampled'
    status          text NOT NULL DEFAULT 'owned',

    location        text,          -- "Bar cart", "Basement shelf 3"
    is_favorite     boolean NOT NULL DEFAULT false,
    notes           text,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bottles_expression_idx ON bottles(expression_id);
CREATE INDEX bottles_store_idx      ON bottles(store_id);
CREATE INDEX bottles_status_idx     ON bottles(status);

CREATE TABLE bottle_images (
    id          serial PRIMARY KEY,
    bottle_id   integer NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
    file_path   text    NOT NULL,          -- relative to the uploads volume
    thumb_path  text,
    caption     text,
    is_primary  boolean NOT NULL DEFAULT false,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bottle_images_one_primary
    ON bottle_images(bottle_id) WHERE is_primary;

-- Tasting notes. Attached to the bottle, so you can compare batches.
CREATE TABLE tasting_notes (
    id          serial PRIMARY KEY,
    bottle_id   integer NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
    tasted_on   date NOT NULL DEFAULT CURRENT_DATE,
    rating      numeric(3,1) CHECK (rating BETWEEN 0 AND 10),
    nose        text,
    palate      text,
    finish      text,
    overall     text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasting_notes_bottle_idx ON tasting_notes(bottle_id);

-- Optional pour log. If you use it, fill_pct can be recomputed from it.
CREATE TABLE pours (
    id          serial PRIMARY KEY,
    bottle_id   integer NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
    poured_at   timestamptz NOT NULL DEFAULT now(),
    amount_ml   numeric(6,2),
    occasion    text
);
CREATE INDEX pours_bottle_idx ON pours(bottle_id);

-- Free-form tags, because there will always be a field you didn't anticipate.
CREATE TABLE tags (
    id    serial PRIMARY KEY,
    name  citext NOT NULL UNIQUE,
    slug  text   NOT NULL UNIQUE,
    color text
);

CREATE TABLE bottle_tags (
    bottle_id integer NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
    tag_id    integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (bottle_id, tag_id)
);

-- ------------------------------------------------------------
-- Convenience view: the flat list for the grid page
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- What the M7 merge collapsed. Empty is the happy case.
-- ------------------------------------------------------------
CREATE TABLE label_merge_log (
    id          serial PRIMARY KEY,
    merged_at   timestamptz NOT NULL DEFAULT now(),
    kept_id     integer NOT NULL,
    kept_name   text    NOT NULL,
    discarded   jsonb   NOT NULL,   -- the whole row, as it was
    differences text[]  NOT NULL    -- columns where the two disagreed
);

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
    c.field_group AS field_group,
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

-- ------------------------------------------------------------
-- Seed: category tree + the Pursuit example as a smoke test
-- ------------------------------------------------------------

INSERT INTO categories (name, slug, parent_id, field_group, sort_order) VALUES
    ('Whiskey', 'whiskey', NULL, 'whiskey', 1),
    ('Rum',     'rum',     NULL, 'rum',     2),
    ('Agave',   'agave',   NULL, 'agave',   3),
    ('Brandy',  'brandy',  NULL, 'brandy',  4);

INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
SELECT v.name, v.slug, (SELECT id FROM categories WHERE slug = 'whiskey'),
       'whiskey', v.ord
FROM (VALUES
    ('American Whiskey', 'american-whiskey', 1),
    ('Scotch',           'scotch',           2),
    ('Irish Whiskey',    'irish-whiskey',    3)
) AS v(name, slug, ord);

INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
SELECT v.name, v.slug, (SELECT id FROM categories WHERE slug = 'american-whiskey'),
       'whiskey', v.ord
FROM (VALUES
    ('Bourbon',          'bourbon',          1),
    ('Rye',              'rye',              2),
    ('Wheat Whiskey',    'wheat-whiskey',    3),
    ('Single Malt',      'american-single-malt', 4),
    ('Light Whiskey',    'light-whiskey',    5)
) AS v(name, slug, ord);

INSERT INTO companies (name, slug, country)
VALUES ('Pursuit Spirits', 'pursuit-spirits', 'USA');

INSERT INTO brands (name, slug, company_id, is_ndp)
SELECT 'Pursuit Spirits', 'pursuit-spirits-brand', id, true
FROM companies WHERE slug = 'pursuit-spirits';

INSERT INTO distilleries (name, slug, state, country) VALUES
    ('Bardstown Bourbon Company', 'bardstown-bourbon-company', 'KY', 'USA'),
    ('Tennessee Distilling Ltd.', 'tennessee-distilling',      'TN', 'USA'),
    ('Finger Lakes Distilling',   'finger-lakes-distilling',   'NY', 'USA');

INSERT INTO mashbills (name, corn, rye, wheat, malted_barley) VALUES
    ('BBC 78/10/12', 78, 10, 0, 12),
    ('TDL 80/10/10', 80, 10, 0, 10),
    ('FLD 70/20/10', 70, 0, 20, 10);

INSERT INTO finishes (name, slug, finish_type)
VALUES ('French Oak', 'french-oak', 'wood');

INSERT INTO stores (name, slug, location, is_online)
VALUES ('P.Club by Pursuit Spirits', 'p-club', 'Online', true);

INSERT INTO expressions (brand_id, category_id, name, slug, proof,
                         age_statement, msrp)
SELECT b.id, c.id, 'Double Oak Spirit', 'pursuit-double-oak-spirit',
       108, 'NAS (labeled Straight, so at least 2 years)', 69.99
FROM brands b, categories c
WHERE b.slug = 'pursuit-spirits-brand' AND c.slug = 'bourbon';

INSERT INTO expression_distilleries (expression_id, distillery_id, position)
SELECT e.id, d.id, d.id
FROM expressions e, distilleries d
WHERE e.slug = 'pursuit-double-oak-spirit';

INSERT INTO expression_mashbills (expression_id, mashbill_id, position)
SELECT e.id, m.id, m.id
FROM expressions e, mashbills m
WHERE e.slug = 'pursuit-double-oak-spirit';

INSERT INTO expression_finishes (expression_id, finish_id, position)
SELECT e.id, f.id, 0
FROM expressions e, finishes f
WHERE e.slug = 'pursuit-double-oak-spirit' AND f.slug = 'french-oak';

INSERT INTO bottles (expression_id, price_paid, store_id, date_acquired,
                     is_open, fill_pct, status)
SELECT e.id, 69.99, s.id, DATE '2025-03-27', false, 100, 'owned'
FROM expressions e, stores s
WHERE e.slug = 'pursuit-double-oak-spirit' AND s.slug = 'p-club';
