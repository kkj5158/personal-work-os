-- ============================================================
-- Workflow Calendar V1
-- LifeCategory: the LIFE-domain counterpart to activity_categories.
-- Deliberately a separate, LIFE-owned table rather than reusing
-- ActivityCategory (which is WORK-scoped by its own documented
-- intent) — mirrors its shape (owner-scoped, sortable, activatable,
-- one default) but flat (no parent_id tree): LIFE categories are a
-- small flat list (exercise, appointment, errands, travel, personal
-- study, rest, household, ...), not a two-level taxonomy.
-- ============================================================

CREATE TABLE life_categories (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,

    name VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_life_categories_user
        FOREIGN KEY (user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE,

    -- Composite uniqueness target for downstream FKs (life_time_entries),
    -- mirroring activity_categories(id, user_id).
    CONSTRAINT uq_life_categories_id_user UNIQUE (id, user_id)
);

CREATE INDEX idx_life_categories_user_sort
    ON life_categories (user_id, sort_order, name);

-- At most one default category per user (matches activity_categories'
-- one-default-per-parent intent, simplified for a flat list).
CREATE UNIQUE INDEX uq_life_categories_user_default
    ON life_categories (user_id)
    WHERE is_default = TRUE;
