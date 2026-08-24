-- ============================================================
-- Time & Work Management V4
-- Rename time_block_categories to activity_categories: this
-- table is the canonical user-owned category shared across
-- Planning, Work Log work-time entries, the future time
-- calendar, and future plan-versus-actual analytics — it is no
-- longer a Planning/time-block-only concept.
--
-- This migration is a pure rename: no columns, defaults, or
-- constraints change in meaning, and no rows are moved, recreated,
-- transformed, seeded, or deleted. Constraint/index names are
-- renamed to match, following the same style V3 used to rename
-- calendar_categories -> time_block_categories.
--
-- planned_time_blocks.category_id keeps its existing column name
-- and keeps pointing at this table by identity, not by name, so
-- that relationship needs no change here.
-- ============================================================


ALTER TABLE time_block_categories RENAME TO activity_categories;

ALTER TABLE activity_categories RENAME CONSTRAINT time_block_categories_pkey TO activity_categories_pkey;
ALTER TABLE activity_categories RENAME CONSTRAINT fk_time_block_categories_user TO fk_activity_categories_user;
ALTER TABLE activity_categories RENAME CONSTRAINT uq_time_block_categories_id_user TO uq_activity_categories_id_user;
ALTER TABLE activity_categories RENAME CONSTRAINT fk_time_block_categories_parent TO fk_activity_categories_parent;
ALTER TABLE activity_categories RENAME CONSTRAINT chk_time_block_categories_not_self_parent TO chk_activity_categories_not_self_parent;
ALTER TABLE activity_categories RENAME CONSTRAINT chk_time_block_categories_sort_order TO chk_activity_categories_sort_order;

ALTER INDEX uq_time_block_categories_root_name RENAME TO uq_activity_categories_root_name;
ALTER INDEX uq_time_block_categories_child_name RENAME TO uq_activity_categories_child_name;
ALTER INDEX idx_time_block_categories_user_parent RENAME TO idx_activity_categories_user_parent;

-- planned_time_blocks' own FK to this table was named for the
-- calendar_blocks/planned_time_blocks side in V3 and was never
-- named after time_block_categories, so it needs no rename here.
