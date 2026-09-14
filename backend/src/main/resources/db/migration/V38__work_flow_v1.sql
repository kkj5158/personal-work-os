-- Reuse existing Project/Phase identity. No Calendar record is changed.
ALTER TABLE projects ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','DONE'));
ALTER TABLE projects ADD COLUMN start_date DATE;
ALTER TABLE projects ADD COLUMN end_date DATE;
ALTER TABLE projects ADD COLUMN memo TEXT;
ALTER TABLE projects ADD CONSTRAINT chk_workflow_project_dates CHECK(end_date >= start_date);
ALTER TABLE phases ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','DOING','DONE'));
ALTER TABLE phases ADD COLUMN memo TEXT;
ALTER TABLE phases ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE phases ALTER COLUMN end_date DROP NOT NULL;

CREATE TABLE work_tasks (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
 phase_id UUID REFERENCES phases(id) ON DELETE SET NULL,
 title VARCHAR(200) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','DOING','DONE')),
 priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH')),
 start_date DATE, due_date DATE, memo TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(due_date >= start_date)
);
CREATE INDEX idx_work_tasks_owner_order ON work_tasks(user_id,sort_order);
CREATE INDEX idx_work_tasks_project_phase ON work_tasks(project_id,phase_id);

CREATE TABLE workpad_days (
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day DATE NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(user_id,day)
);
CREATE TABLE workpad_blocks (
 id UUID PRIMARY KEY, user_id UUID NOT NULL, day DATE NOT NULL,
 parent_id UUID, sort_order INTEGER NOT NULL, type VARCHAR(24) NOT NULL,
 content TEXT NOT NULL DEFAULT '', checked BOOLEAN NOT NULL DEFAULT FALSE,
 work_task_id UUID REFERENCES work_tasks(id) ON DELETE SET NULL,
 source_block_id UUID, source_date DATE, metadata TEXT NOT NULL DEFAULT '{}',
 FOREIGN KEY(user_id,day) REFERENCES workpad_days(user_id,day) ON DELETE CASCADE
);
CREATE INDEX idx_workpad_blocks_day ON workpad_blocks(user_id,day,sort_order);
CREATE TABLE workflow_preferences (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 preferences TEXT NOT NULL DEFAULT '{}'
);
-- Reuse the bounded private media store without creating NOTE SYS domain data.
ALTER TABLE journal_media ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE journal_media ADD COLUMN workflow_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE journal_media ADD CONSTRAINT chk_media_domain CHECK ((workspace_id IS NOT NULL) <> (workflow_owner_id IS NOT NULL));
CREATE INDEX idx_journal_media_workflow_owner ON journal_media(workflow_owner_id);
ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workpad_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE workpad_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_preferences ENABLE ROW LEVEL SECURITY;
