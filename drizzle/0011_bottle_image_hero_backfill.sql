-- The hero (isPrimary) photo is now always the catalog photo, and every
-- other photo is a life photo — kind is no longer set independently. Bring
-- existing rows in line so old manual catalog/life tagging doesn't linger.
UPDATE bottle_images SET kind = 'catalog' WHERE is_primary AND kind <> 'catalog';
UPDATE bottle_images SET kind = 'life' WHERE NOT is_primary AND kind <> 'life';
