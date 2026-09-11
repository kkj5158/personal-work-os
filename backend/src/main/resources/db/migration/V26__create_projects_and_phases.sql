-- ============================================================
-- Workflow Calendar V1
-- Minimal Project/Phase bridge. This is intentionally NOT a full
-- Project Management domain (no task hierarchy, no progress
-- tracking, no status workflow) — just enough for Calendar's
-- lightweight Phase context: a PlanningBlock/WorkTimeEntry/
-- SupplementalWorkEntry may optionally reference a Phase, and a
-- Phase's Project is derived via phases.project_id (never
-- duplicated as a redundant project_id on the referencing row).
-- ============================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,

    name VARCHAR(200) NOT NULL,
    color_token VARCHAR(30) NOT NULL DEFAULT 'slate',
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_projects_user
        FOREIGN KEY (user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE
);

CREATE INDEX idx_projects_user_sort
    ON projects (user_id, sort_order, name);

CREATE TABLE phases (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    project_id UUID NOT NULL,

    title VARCHAR(200) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_phases_user
        FOREIGN KEY (user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE,

    CONSTRAINT fk_phases_project
        FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE CASCADE,

    CONSTRAINT chk_phases_date_range
        CHECK (end_date >= start_date),

    -- Composite uniqueness target for downstream FKs.
    CONSTRAINT uq_phases_id_user UNIQUE (id, user_id)
);

CREATE INDEX idx_phases_project_dates
    ON phases (project_id, start_date, end_date);

CREATE INDEX idx_phases_user_dates
    ON phases (user_id, start_date, end_date);
