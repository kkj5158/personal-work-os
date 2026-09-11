-- ============================================================
-- Workflow Calendar V1
-- LifeStateEntry (the "State Block"): independent LIFE-owned
-- time-state data — NOT an attribute of any Activity/Planning
-- block. state_group is a fixed V1 vocabulary (LOW/HIGH/MIXED/
-- UNCLEAR/STABLE); label is free text so a small default preset
-- and user-custom labels can share one column without a second
-- lookup table (V1 explicitly does not need a large taxonomy).
--
-- Unlike Planning (overlap allowed) and unlike WORK/LIFE Actual
-- (cross-domain overlap forbidden), State may overlap Planning and
-- Actual freely but must not overlap ANOTHER state row for the same
-- owner (enforced at the application level in LifeStateEntryService,
-- matching this codebase's existing overlap-validation pattern —
-- see PlannedTimeBlockService / SupplementalWorkEntryService).
-- ============================================================

CREATE TABLE life_state_entries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    entry_date DATE NOT NULL,

    state_group VARCHAR(10) NOT NULL,
    label VARCHAR(100) NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    memo TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_life_state_entries_user
        FOREIGN KEY (user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE,

    CONSTRAINT chk_life_state_entries_state_group
        CHECK (state_group IN ('LOW', 'HIGH', 'MIXED', 'UNCLEAR', 'STABLE')),

    CONSTRAINT chk_life_state_entries_start_before_end
        CHECK (end_at > start_at)
);

CREATE INDEX idx_life_state_entries_user_date
    ON life_state_entries (user_id, entry_date);

CREATE INDEX idx_life_state_entries_user_time_range
    ON life_state_entries (user_id, start_at, end_at);
