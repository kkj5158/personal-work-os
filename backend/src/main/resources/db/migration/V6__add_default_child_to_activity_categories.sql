-- ============================================================
-- Time & Work Management V6
-- Adds default-child support to activity_categories: each root
-- category may designate at most one of its own active child
-- categories as the default, so a future consumer (Work Log,
-- Planning, the time calendar) can auto-select a sensible child
-- the moment its parent is chosen. Root categories are grouping
-- nodes only and can never be a default themselves, and a
-- default child must always be active.
-- ============================================================

ALTER TABLE activity_categories
    ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing rows all become is_default = FALSE via the column
-- default above. No arbitrary existing child is promoted to
-- default, and no fake "기본" placeholder category is created —
-- a parent may simply have no default until one is explicitly
-- chosen (by the first child created under it going forward, or
-- later via PUT /api/activity-categories/{id}/default).

-- Structural rule: a default must be a child (parent_id NOT NULL)
-- and must be active. Combining both conditions in one CHECK is
-- safe here because is_active and parent_id already live on the
-- same row.
ALTER TABLE activity_categories
    ADD CONSTRAINT chk_activity_categories_default_requires_active_child
        CHECK (
            is_default = FALSE
                OR (parent_id IS NOT NULL AND is_active = TRUE)
            );

-- At most one default child per (user, parent). A root can never
-- match this partial index in practice, since the CHECK above
-- already forbids is_default = TRUE when parent_id IS NULL.
CREATE UNIQUE INDEX uq_activity_categories_default_child
    ON activity_categories (user_id, parent_id)
    WHERE is_default = TRUE;
