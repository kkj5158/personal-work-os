-- ============================================================
-- WORK FLOW V1 core domain (Batch 2). Additive only.
-- work_tasks stays the single canonical Task identity; every new table
-- references it rather than copying Task data.
-- Legacy work_tasks.start_date/due_date remain the old Timeline range and
-- are NOT reinterpreted: the V1 real deadline is the new deadline_date.
-- No historical value is backfilled (completed_at stays NULL for old DONE
-- rows; deadline_date stays NULL).
-- The two replaced CHECK constraints carry the names PostgreSQL generated
-- for the inline V38 checks (verified by a full local replay of V1-V59 and
-- by shared DEV pg_constraint on 2026-09-27).
-- ============================================================

-- Project: type, goal, archive, pinned next Task, unassigned weight, READY status, revision.
ALTER TABLE projects ADD COLUMN project_type VARCHAR(16) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE projects ADD CONSTRAINT chk_projects_type CHECK (project_type IN ('GENERAL','DEVELOPMENT','CONTENT','PERSONAL'));
ALTER TABLE projects ADD COLUMN goal TEXT;
ALTER TABLE projects ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN next_task_id UUID;
ALTER TABLE projects ADD CONSTRAINT fk_projects_next_task FOREIGN KEY (next_task_id) REFERENCES work_tasks(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN unassigned_weight NUMERIC(5,2);
ALTER TABLE projects ADD CONSTRAINT chk_projects_unassigned_weight CHECK (unassigned_weight IS NULL OR (unassigned_weight >= 0 AND unassigned_weight <= 100));
ALTER TABLE projects ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE projects DROP CONSTRAINT projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('READY','ACTIVE','PAUSED','DONE'));

-- Phase (optional work group): weight and manual progress override. NULL = unconfirmed / automatic.
ALTER TABLE phases ADD COLUMN weight NUMERIC(5,2);
ALTER TABLE phases ADD CONSTRAINT chk_phases_weight CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100));
ALTER TABLE phases ADD COLUMN progress_override SMALLINT;
ALTER TABLE phases ADD CONSTRAINT chk_phases_progress_override CHECK (progress_override IS NULL OR (progress_override >= 0 AND progress_override <= 100));
ALTER TABLE phases ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;

-- Task: WAITING status, semantic deadline, waiting context, lifecycle and revision.
ALTER TABLE work_tasks DROP CONSTRAINT work_tasks_status_check;
ALTER TABLE work_tasks ADD CONSTRAINT work_tasks_status_check CHECK (status IN ('TODO','DOING','WAITING','DONE'));
ALTER TABLE work_tasks ADD COLUMN deadline_date DATE;
ALTER TABLE work_tasks ADD COLUMN waiting_reason TEXT;
ALTER TABLE work_tasks ADD COLUMN waiting_next_action TEXT;
ALTER TABLE work_tasks ADD COLUMN waiting_check_date DATE;
ALTER TABLE work_tasks ADD COLUMN waiting_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE work_tasks ADD COLUMN next_step TEXT;
ALTER TABLE work_tasks ADD COLUMN completed_at TIMESTAMPTZ;
ALTER TABLE work_tasks ADD COLUMN previous_status VARCHAR(16);
ALTER TABLE work_tasks ADD CONSTRAINT chk_work_tasks_previous_status CHECK (previous_status IS NULL OR previous_status IN ('TODO','DOING','WAITING','DONE'));
ALTER TABLE work_tasks ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE work_tasks ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;
CREATE INDEX idx_work_tasks_owner_waiting ON work_tasks(user_id, status, waiting_check_date);

-- Plan days: one Task, many planned dates; one placement per Task + date.
CREATE TABLE work_task_plan_days (
 task_id UUID NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 day DATE NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (task_id, day)
);
CREATE INDEX idx_work_task_plan_days_owner_day ON work_task_plan_days(user_id, day, sort_order);

-- Week planning. week_start is always a Monday (validated by the service).
CREATE TABLE work_weeks (
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 week_start DATE NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY (user_id, week_start)
);
-- Exactly three ordered Focus Area positions (0,1,2); a missing row reads as an empty slot.
CREATE TABLE work_week_focus_slots (
 user_id UUID NOT NULL,
 week_start DATE NOT NULL,
 slot SMALLINT NOT NULL,
 title VARCHAR(200) NOT NULL DEFAULT '',
 memo TEXT NOT NULL DEFAULT '',
 PRIMARY KEY (user_id, week_start, slot),
 CONSTRAINT chk_work_week_focus_slot CHECK (slot >= 0 AND slot <= 2),
 CONSTRAINT fk_work_week_focus_week FOREIGN KEY (user_id, week_start) REFERENCES work_weeks(user_id, week_start) ON DELETE CASCADE
);
CREATE TABLE work_week_goals (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL,
 week_start DATE NOT NULL,
 text VARCHAR(500) NOT NULL,
 checked BOOLEAN NOT NULL DEFAULT FALSE,
 sort_order INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT fk_work_week_goals_week FOREIGN KEY (user_id, week_start) REFERENCES work_weeks(user_id, week_start) ON DELETE CASCADE
);
CREATE INDEX idx_work_week_goals_week ON work_week_goals(user_id, week_start, sort_order);
CREATE TABLE work_week_projects (
 user_id UUID NOT NULL,
 week_start DATE NOT NULL,
 project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 sort_order INTEGER NOT NULL DEFAULT 0,
 scope_line TEXT,
 PRIMARY KEY (user_id, week_start, project_id),
 CONSTRAINT fk_work_week_projects_week FOREIGN KEY (user_id, week_start) REFERENCES work_weeks(user_id, week_start) ON DELETE CASCADE
);
-- Explicit weekly focus selection. Independent of plan days: removing a selection never removes a placement.
CREATE TABLE work_week_tasks (
 user_id UUID NOT NULL,
 week_start DATE NOT NULL,
 task_id UUID NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
 sort_order INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (user_id, week_start, task_id),
 CONSTRAINT fk_work_week_tasks_week FOREIGN KEY (user_id, week_start) REFERENCES work_weeks(user_id, week_start) ON DELETE CASCADE
);

-- Minimal Task history: completion/reopen, waiting/resume, deadline, archive. Not event sourcing.
CREATE TABLE work_task_events (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 task_id UUID NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
 kind VARCHAR(24) NOT NULL,
 from_status VARCHAR(16),
 to_status VARCHAR(16),
 payload TEXT NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_work_task_events_task ON work_task_events(task_id, created_at);

-- Linked resources reference their original system (Shared Note Core noteId or an external URL).
CREATE TABLE workflow_resource_links (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
 task_id UUID REFERENCES work_tasks(id) ON DELETE CASCADE,
 note_id UUID REFERENCES journal_notes(id) ON DELETE CASCADE,
 url VARCHAR(2000),
 title VARCHAR(240) NOT NULL,
 type VARCHAR(16) NOT NULL,
 memo TEXT,
 sort_order INTEGER NOT NULL DEFAULT 0,
 pinned BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT chk_resource_links_owner CHECK ((project_id IS NOT NULL AND task_id IS NULL) OR (project_id IS NULL AND task_id IS NOT NULL)),
 CONSTRAINT chk_resource_links_target CHECK ((note_id IS NOT NULL AND url IS NULL) OR (note_id IS NULL AND url IS NOT NULL)),
 CONSTRAINT chk_resource_links_type CHECK (type IN ('NOTE','DRIVE','DESIGN','GIT','AI_CHAT','WEB'))
);
CREATE INDEX idx_resource_links_project ON workflow_resource_links(project_id, sort_order);
CREATE INDEX idx_resource_links_task ON workflow_resource_links(task_id, sort_order);

-- TaskReference lookups (Add to Today / Continue idempotency, Recent Records projection).
CREATE INDEX idx_workpad_blocks_task_day ON workpad_blocks(user_id, work_task_id, day);

ALTER TABLE work_task_plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_week_focus_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_week_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_week_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_week_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_resource_links ENABLE ROW LEVEL SECURITY;
