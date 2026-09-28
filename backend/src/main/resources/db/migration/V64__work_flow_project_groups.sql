-- WORK FLOW Project Groups: an owner-scoped organization layer for the Projects catalog only.
-- Groups never affect Phase, Project Type, status, progress, dates, This Week or Task semantics.
-- Additive: existing projects keep their rows and resolve to "그룹 없음" (group_id NULL).
CREATE TABLE workflow_project_groups (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name VARCHAR(80) NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 revision BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT chk_project_groups_name CHECK (length(trim(name)) > 0)
);
CREATE INDEX idx_project_groups_user ON workflow_project_groups(user_id, sort_order);

-- Catalog order = group sort_order, then projects.sort_order within the group (existing values stay valid).
ALTER TABLE projects ADD COLUMN group_id UUID REFERENCES workflow_project_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_projects_group ON projects(user_id, group_id, sort_order);

ALTER TABLE workflow_project_groups ENABLE ROW LEVEL SECURITY;
