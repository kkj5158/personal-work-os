-- Calendar category colors become server-persisted (previously browser-local
-- localStorage overrides over a hash of the environment-specific UUID).
--
-- color:            '#rrggbb'. Root categories always carry one. A child with
--                   NULL inherits its root's color (explicit, server-side).
-- color_customized: TRUE once the owner picked the color (or it was imported
--                   from the owner's legacy browser override). Generated colors
--                   stay FALSE so a one-time legacy import may replace them.
--
-- Initial root colors derive from a stable semantic key, never the UUID:
--   key   = '<WORK|LIFE>:' || lower(btrim(normalize(name, NFC)))
--   index = first 32 bits of md5(key) as unsigned int, mod 6
-- Mirrored exactly by com.kafka.backend.common.CategoryColor#initialColor.
-- Additive only; existing rows keep every other value.

ALTER TABLE activity_categories
    ADD COLUMN color VARCHAR(7),
    ADD COLUMN color_customized BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT chk_activity_categories_color CHECK (color IS NULL OR color ~ '^#[0-9a-f]{6}$');

ALTER TABLE life_categories
    ADD COLUMN color VARCHAR(7),
    ADD COLUMN color_customized BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT chk_life_categories_color CHECK (color IS NULL OR color ~ '^#[0-9a-f]{6}$');

UPDATE activity_categories
SET color = (ARRAY['#4b89dc', '#9674cf', '#48a78a', '#d5a344', '#d97991', '#679aa7'])[
        (('x' || substr(md5('WORK:' || lower(btrim(normalize(name, NFC)))), 1, 8))::bit(32)::bigint % 6) + 1]
WHERE parent_id IS NULL AND color IS NULL;

UPDATE life_categories
SET color = (ARRAY['#4b89dc', '#9674cf', '#48a78a', '#d5a344', '#d97991', '#679aa7'])[
        (('x' || substr(md5('LIFE:' || lower(btrim(normalize(name, NFC)))), 1, 8))::bit(32)::bigint % 6) + 1]
WHERE parent_id IS NULL AND color IS NULL;
