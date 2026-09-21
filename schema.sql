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

-- Mashbills are reusable entities so you can ask "everything using this recipe".
-- Percentages should sum to 100; enforced in app, checked loosely here.
CREATE TABLE mashbills (
    id              serial PRIMARY KEY,
    name            citext,        -- optional label, e.g. "BBC High Rye"
    corn            numeric(5,2) NOT NULL DEFAULT 0,
    rye             numeric(5,2) NOT NULL DEFAULT 0,
    wheat           numeric(5,2) NOT NULL DEFAULT 0,
    malted_barley   numeric(5,2) NOT NULL DEFAULT 0,
    malted_rye      numeric(5,2) NOT NULL DEFAULT 0,
    other_grain     numeric(5,2) NOT NULL DEFAULT 0,
    other_grain_name text,
    distillery_id   integer REFERENCES distilleries(id) ON DELETE SET NULL,
    notes           text,
    CONSTRAINT mashbill_sums_to_100 CHECK (
        corn + rye + wheat + malted_barley + malted_rye + other_grain
        BETWEEN 99.0 AND 101.0
    )
);

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

CREATE TABLE expressions (
    id              serial PRIMARY KEY,
    brand_id        integer NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    category_id     integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name            citext  NOT NULL,          -- "Double Oak Spirit"
    slug            text    NOT NULL UNIQUE,

    -- Batch / release identity. Two batches of the same name are two rows.
    batch           text,                      -- "Batch 2", "B524"
    release_year    integer,
    is_single_barrel boolean NOT NULL DEFAULT false,
    barrel_number   text,
    bottle_count    integer,                   -- total bottles in the release

    -- Strength
    proof           numeric(5,2),
    abv             numeric(5,2) GENERATED ALWAYS AS (proof / 2.0) STORED,
    is_cask_strength boolean NOT NULL DEFAULT false,
    is_bottled_in_bond boolean NOT NULL DEFAULT false,
    is_single_barrel_pick boolean NOT NULL DEFAULT false,
    pick_name       text,                      -- store pick / society pick label

    -- ---- Single barrel / private selection detail.
    -- Nullable; the UI reveals this block when is_single_barrel or
    -- is_single_barrel_pick is set.
    picked_by       text,      -- the group that picked it: club, bar, society
    barrel_filled_on date,     -- fill/dump dates give you the exact age
    bottled_on      date,
    warehouse       text,      -- rickhouse identifier, e.g. "Warehouse H"
    rick_floor      text,      -- floor / rick position, e.g. "5th floor, rick 12"

    -- Age. NULL age_years = NAS; age_statement carries the human text.
    -- years/months/days let a single barrel carry its exact age when the
    -- fill and bottling dates are not both known.
    age_years       numeric(4,1),
    age_months      integer,
    age_days        integer,
    age_statement   text,                      -- "NAS (Straight, so >= 2 years)"

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
    UNIQUE (brand_id, name, batch)
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
    estimated_value numeric(10,2),
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

CREATE VIEW bottle_list AS
SELECT
    b.id,
    b.status,
    b.is_open,
    b.fill_pct,
    b.price_paid,
    b.date_acquired,
    e.id   AS expression_id,
    e.name AS expression_name,
    e.batch,
    e.proof,
    e.abv,
    e.age_statement,
    e.msrp,
    br.name AS brand,
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
       FROM tasting_notes tn WHERE tn.bottle_id = b.id) AS avg_rating
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
