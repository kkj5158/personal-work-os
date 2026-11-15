-- One independent, versioned Workpad-format document per authenticated owner.
-- No existing Workpad, note, fixed tab or task is initialized or rewritten.
CREATE TABLE workflow_work_routines (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    revision BIGINT NOT NULL DEFAULT 0,
    blocks TEXT NOT NULL DEFAULT '[]'
);
ALTER TABLE workflow_work_routines ENABLE ROW LEVEL SECURITY;
