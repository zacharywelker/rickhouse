-- What the owner decided on the Housekeeping page. One generic table remembers "not a duplicate", "not on TTB" and
-- "leave blank": scope names the question (for example 'duplicate:brands'), key names the thing (for example '3:9').
CREATE TABLE housekeeping_dismissals (
    id         serial PRIMARY KEY,
    owner_id   integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope      text NOT NULL,
    key        text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT housekeeping_dismissals_unique UNIQUE (owner_id, scope, key)
);
--> statement-breakpoint
CREATE INDEX housekeeping_dismissals_owner_scope_idx ON housekeeping_dismissals (owner_id, scope);
--> statement-breakpoint
-- A record of each merge: what was kept, what was removed, what moved. Merges cannot be undone; this is what a
-- mistaken one is repaired from. Names are copied because the removed row is gone.
CREATE TABLE housekeeping_merges (
    id            serial PRIMARY KEY,
    owner_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          text NOT NULL,
    survivor_id   integer NOT NULL,
    survivor_name text NOT NULL,
    removed_id    integer NOT NULL,
    removed_name  text NOT NULL,
    moved         jsonb NOT NULL DEFAULT '[]'::jsonb,
    adopted       jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX housekeeping_merges_owner_idx ON housekeeping_merges (owner_id, created_at DESC);
