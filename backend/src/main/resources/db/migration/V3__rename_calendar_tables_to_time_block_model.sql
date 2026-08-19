-- ============================================================
-- Time & Work Management V3
-- Rename calendar_* tables to match the clarified Plan/Actual
-- time-block product model. Planned Time Blocks are implemented
-- in this slice; Actual Time Blocks are deferred to a later
-- migration and will reference planned_time_blocks by id.
--
-- This migration is a pure rename: no columns, defaults, or
-- constraints change in meaning. Constraint/index names are
-- renamed to match, using the exact names created in V1.
-- ============================================================


-- ============================================================
-- 1. CALENDAR CATEGORIES -> TIME BLOCK CATEGORIES
-- ============================================================

ALTER TABLE calendar_categories RENAME TO time_block_categories;

ALTER TABLE time_block_categories RENAME CONSTRAINT calendar_categories_pkey TO time_block_categories_pkey;
ALTER TABLE time_block_categories RENAME CONSTRAINT fk_calendar_categories_user TO fk_time_block_categories_user;
ALTER TABLE time_block_categories RENAME CONSTRAINT uq_calendar_categories_id_user TO uq_time_block_categories_id_user;
ALTER TABLE time_block_categories RENAME CONSTRAINT fk_calendar_categories_parent TO fk_time_block_categories_parent;
ALTER TABLE time_block_categories RENAME CONSTRAINT chk_calendar_categories_not_self_parent TO chk_time_block_categories_not_self_parent;
ALTER TABLE time_block_categories RENAME CONSTRAINT chk_calendar_categories_sort_order TO chk_time_block_categories_sort_order;

ALTER INDEX uq_calendar_categories_root_name RENAME TO uq_time_block_categories_root_name;
ALTER INDEX uq_calendar_categories_child_name RENAME TO uq_time_block_categories_child_name;
ALTER INDEX idx_calendar_categories_user_parent RENAME TO idx_time_block_categories_user_parent;


-- ============================================================
-- 2. CALENDAR BLOCKS -> PLANNED TIME BLOCKS
-- ============================================================

ALTER TABLE calendar_blocks RENAME TO planned_time_blocks;

ALTER TABLE planned_time_blocks RENAME CONSTRAINT calendar_blocks_pkey TO planned_time_blocks_pkey;
ALTER TABLE planned_time_blocks RENAME CONSTRAINT fk_calendar_blocks_user TO fk_planned_time_blocks_user;
ALTER TABLE planned_time_blocks RENAME CONSTRAINT fk_calendar_blocks_category TO fk_planned_time_blocks_category;
ALTER TABLE planned_time_blocks RENAME CONSTRAINT chk_calendar_blocks_time_order TO chk_planned_time_blocks_time_order;

ALTER INDEX idx_calendar_blocks_user_start RENAME TO idx_planned_time_blocks_user_start;
ALTER INDEX idx_calendar_blocks_user_time_range RENAME TO idx_planned_time_blocks_user_time_range;
ALTER INDEX idx_calendar_blocks_category RENAME TO idx_planned_time_blocks_category;
