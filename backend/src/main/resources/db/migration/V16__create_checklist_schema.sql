-- Daily Work Checklist system (post-production iteration 1).
--
-- Design summary (see docs/backend/checklist.md for the full write-up):
--   * checklist_items holds permanent item identity + current management
--     state (category, ordering, a one-way deleted_at tombstone).
--   * checklist_item_versions holds the effective-dated definition (name,
--     emoji, priority, active flag, optional goal override) — historical
--     dates always resolve to the version whose effective_from is the
--     latest one on or before that date, never a live join to "current."
--   * checklist_global_goals is the same effective-dated pattern for the
--     shared default achievement goal.
--   * checklist_daily_entries is both the per-day snapshot (frozen display
--     fields, taken once when a date first becomes work-included) AND the
--     daily result (the achieved checkbox) — one row per (work_record,
--     item). Applicability is never stored here; it is always derived live
--     from the parent work_records.status, so a date's checklist rows
--     automatically become non-applicable / re-applicable as attendance
--     changes, with no separate flag to keep in sync.

CREATE TABLE checklist_categories (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_checklist_categories_user
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_checklist_categories_user ON checklist_categories (user_id, position);

CREATE TABLE checklist_items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    -- NULL = "Uncategorized". A deleted category sets this NULL rather than
    -- cascading a delete onto the items themselves — see
    -- ChecklistCategoryService.delete.
    category_id UUID,
    position INTEGER NOT NULL DEFAULT 0,
    -- One-way tombstone. Once set, permanently DELETED from the ordinary
    -- management UI; never reactivatable; historical checklist_daily_entries
    -- rows referencing this item are preserved untouched.
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_checklist_items_user
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_checklist_items_category
        FOREIGN KEY (category_id) REFERENCES checklist_categories(id) ON DELETE SET NULL
);

CREATE INDEX idx_checklist_items_user ON checklist_items (user_id);
CREATE INDEX idx_checklist_items_category ON checklist_items (category_id);

CREATE TABLE checklist_item_versions (
    id UUID PRIMARY KEY,
    item_id UUID NOT NULL,
    -- The date this definition starts applying (inclusive). A row whose
    -- effective_from is strictly before "today" is immutable — see
    -- ChecklistItemService for the enforcement.
    effective_from DATE NOT NULL,
    name VARCHAR(100) NOT NULL,
    emoji VARCHAR(16) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    is_active BOOLEAN NOT NULL,
    -- NULL = uses the global default goal effective on the same date.
    goal_override_percent INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_checklist_item_versions_item
        FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE,
    CONSTRAINT uq_checklist_item_versions_item_date
        UNIQUE (item_id, effective_from),
    CONSTRAINT chk_checklist_item_versions_priority
        CHECK (priority IN ('CORE', 'SECONDARY')),
    CONSTRAINT chk_checklist_item_versions_goal
        CHECK (goal_override_percent IS NULL OR goal_override_percent BETWEEN 0 AND 100)
);

CREATE INDEX idx_checklist_item_versions_item_date ON checklist_item_versions (item_id, effective_from);

CREATE TABLE checklist_global_goals (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    effective_from DATE NOT NULL,
    goal_percent INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_checklist_global_goals_user
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT uq_checklist_global_goals_user_date
        UNIQUE (user_id, effective_from),
    CONSTRAINT chk_checklist_global_goals_range
        CHECK (goal_percent BETWEEN 0 AND 100)
);

CREATE INDEX idx_checklist_global_goals_user_date ON checklist_global_goals (user_id, effective_from);

CREATE TABLE checklist_daily_entries (
    id UUID PRIMARY KEY,
    work_record_id UUID NOT NULL,
    item_id UUID NOT NULL,
    -- Denormalized for ownership/range queries without a join, matching the
    -- convention already used by work_time_entries.
    user_id UUID NOT NULL,
    work_date DATE NOT NULL,
    -- Frozen snapshot fields — the definition that was actually applicable
    -- when this date's checklist was first populated. Never re-read from
    -- checklist_item_versions afterward.
    name VARCHAR(100) NOT NULL,
    emoji VARCHAR(16) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    goal_percent INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- The daily result. FALSE means "not achieved" for a past date, or
    -- "not yet determined" for today — that distinction is date-aware
    -- application logic, not a third stored state.
    achieved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_checklist_daily_entries_work_record
        FOREIGN KEY (work_record_id) REFERENCES work_records(id) ON DELETE CASCADE,
    -- RESTRICT: an item can never be physically deleted while historical
    -- daily entries reference it — deletion is always the deleted_at
    -- tombstone on checklist_items instead.
    CONSTRAINT fk_checklist_daily_entries_item
        FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE RESTRICT,
    CONSTRAINT uq_checklist_daily_entries_record_item
        UNIQUE (work_record_id, item_id),
    CONSTRAINT chk_checklist_daily_entries_priority
        CHECK (priority IN ('CORE', 'SECONDARY')),
    CONSTRAINT chk_checklist_daily_entries_goal
        CHECK (goal_percent BETWEEN 0 AND 100)
);

CREATE INDEX idx_checklist_daily_entries_user_date ON checklist_daily_entries (user_id, work_date);
CREATE INDEX idx_checklist_daily_entries_item ON checklist_daily_entries (item_id);
