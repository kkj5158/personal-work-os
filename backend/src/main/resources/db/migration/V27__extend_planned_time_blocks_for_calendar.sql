-- ============================================================
-- Workflow Calendar V1
-- Extends planned_time_blocks (the existing Planning-side block
-- entity) to carry the WORK/LIFE domain split and optional Phase
-- context the Calendar needs, rather than introducing a duplicate
-- "PlanningBlock" table.
--
-- - category_id is renamed to activity_category_id: its meaning
--   narrows to "WORK-domain activity category" now that a LIFE
--   block uses life_category_id instead. Existing rows (all WORK
--   today, since LIFE/domain_type did not exist before this
--   migration) keep their category reference unchanged.
-- - domain_type is NOT NULL with a default of 'WORK' so existing
--   rows classify correctly with no backfill needed; the default
--   is dropped after backfill so future inserts must state it
--   explicitly.
-- - Overlap is intentionally allowed for Planning blocks (locked
--   V1 product policy) — no exclusion constraint or CHECK enforces
--   non-overlap here; the application only splits overlapping
--   blocks into visual lanes.
-- ============================================================

ALTER TABLE planned_time_blocks
    RENAME COLUMN category_id TO activity_category_id;

ALTER TABLE planned_time_blocks
    RENAME CONSTRAINT fk_planned_time_blocks_category TO fk_planned_time_blocks_activity_category;

ALTER INDEX idx_planned_time_blocks_category RENAME TO idx_planned_time_blocks_activity_category;

ALTER TABLE planned_time_blocks
    ADD COLUMN domain_type VARCHAR(10) NOT NULL DEFAULT 'WORK';

ALTER TABLE planned_time_blocks
    ALTER COLUMN domain_type DROP DEFAULT;

ALTER TABLE planned_time_blocks
    ADD CONSTRAINT chk_planned_time_blocks_domain_type
        CHECK (domain_type IN ('WORK', 'LIFE'));

ALTER TABLE planned_time_blocks
    ADD COLUMN life_category_id UUID;

ALTER TABLE planned_time_blocks
    ADD CONSTRAINT fk_planned_time_blocks_life_category
        FOREIGN KEY (life_category_id, user_id)
            REFERENCES life_categories(id, user_id)
            ON DELETE RESTRICT;

ALTER TABLE planned_time_blocks
    ADD COLUMN phase_id UUID;

ALTER TABLE planned_time_blocks
    ADD CONSTRAINT fk_planned_time_blocks_phase
        FOREIGN KEY (phase_id, user_id)
            REFERENCES phases(id, user_id)
            ON DELETE SET NULL;

CREATE INDEX idx_planned_time_blocks_life_category
    ON planned_time_blocks (life_category_id);

CREATE INDEX idx_planned_time_blocks_phase
    ON planned_time_blocks (phase_id);
