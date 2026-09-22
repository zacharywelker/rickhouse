-- Phase 3 (issue #22): the gallery and bottle detail want to tell a catalog
-- photo (the label/product shot) apart from a life photo (the bottle on your
-- shelf, at a tasting, in someone's hand) — SPEC §19 lists both as things a
-- bottle's photos can be, and the schema had no way to say which is which.
ALTER TABLE bottle_images
    ADD COLUMN kind text NOT NULL DEFAULT 'life';
