-- Issue #12: proof/ABV and age-statement fixes.
--
-- Proof and ABV were already linked in the database (abv is generated from
-- proof); what was missing was letting the age statement fill itself in from
-- a designation, the way "Bottled-in-Bond" already implies a minimum age.
-- Straight and NAS are the same idea, so they get the same treatment: a
-- checkbox that fills age_statement when it is blank, never overwriting a
-- more specific statement someone already typed.

ALTER TABLE expressions
    ADD COLUMN is_straight boolean NOT NULL DEFAULT false,
    ADD COLUMN is_nas      boolean NOT NULL DEFAULT false;
