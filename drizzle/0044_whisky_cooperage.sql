CREATE TABLE cooperages (
  id serial PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name citext NOT NULL,
  slug text NOT NULL,
  notes text,
  CONSTRAINT cooperages_owner_name_unique UNIQUE (owner_id, name),
  CONSTRAINT cooperages_owner_slug_unique UNIQUE (owner_id, slug),
  CONSTRAINT cooperages_id_owner_unique UNIQUE (id, owner_id)
);
CREATE INDEX cooperages_owner_idx ON cooperages(owner_id);

ALTER TABLE expressions ADD COLUMN cooperage_id integer REFERENCES cooperages(id) ON DELETE SET NULL;

ALTER TABLE expressions DROP CONSTRAINT expressions_cooperage_id_fkey;
ALTER TABLE expressions ADD CONSTRAINT expressions_cooperage_owner_fk
  FOREIGN KEY (cooperage_id, owner_id)
  REFERENCES cooperages(id, owner_id)
  ON DELETE SET NULL (cooperage_id);
