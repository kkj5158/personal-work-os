-- ============================================================
-- Workflow Calendar V1
-- LifeTimeEntry: the LIFE-domain counterpart to WorkTimeEntry —
-- actual everyday-life time (exercise, appointments, errands,
-- travel, personal study, rest, household/personal activities).
-- Deliberately its own table (not a WorkTimeEntry discriminator,
-- not owned by any WorkRecord): LIFE actual time has no owning
-- daily record the way WORK time is owned by a WorkRecord, and
-- must never carry WORK-only fields or lifecycle assumptions.
--
-- duration_minutes is the source of truth (mirrors WorkTimeEntry's
-- minutes / SupplementalWorkEntry's total_minutes); start_at/end_at
-- are optional, same-day, both-or-neither, matching every other
-- actual-time entity in this schema. No cross-midnight interval —
-- a life activity continuing past midnight is a separate next-day
-- row, same rule as work.
-- ============================================================

CREATE TABLE life_time_entries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    entry_date DATE NOT NULL,
    life_category_id UUID,

    title VARCHAR(200) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    memo TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_life_time_entries_user
        FOREIGN KEY (user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE,

    CONSTRAINT fk_life_time_entries_category
        FOREIGN KEY (life_category_id, user_id)
            REFERENCES life_categories(id, user_id)
            ON DELETE RESTRICT,

    CONSTRAINT chk_life_time_entries_duration
        CHECK (duration_minutes > 0),

    CONSTRAINT chk_life_time_entries_start_end_pair
        CHECK ((start_at IS NULL) = (end_at IS NULL)),

    CONSTRAINT chk_life_time_entries_start_before_end
        CHECK (start_at IS NULL OR end_at > start_at)
);

CREATE INDEX idx_life_time_entries_user_date
    ON life_time_entries (user_id, entry_date);

CREATE INDEX idx_life_time_entries_category
    ON life_time_entries (life_category_id);
