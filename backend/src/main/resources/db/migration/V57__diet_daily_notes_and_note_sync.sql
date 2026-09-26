-- DIET SYS Mobile V2 / Planner: one canonical Diet Daily Note per owner + Seoul date.
-- The date is the only axis: no challenge_id. Challenge/Focus context is derived
-- from the date at read time, so editing Challenge periods never moves a note.
-- (V56 is intentionally left to concurrent MONEY work; see docs/diet-sys/MOBILE_V2.md.)
CREATE TABLE diet_daily_notes (
 owner_id UUID NOT NULL REFERENCES auth.users(id), entry_date DATE NOT NULL,
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
 version BIGINT NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,entry_date)
);
ALTER TABLE diet_daily_notes ENABLE ROW LEVEL SECURITY;

-- "NOTE SYS에 다이어트 기록 자동 정리": explicit opt-in, OFF for every existing owner.
-- The target is an ordinary NOTE SYS Workspace; deleting it simply disables the target.
ALTER TABLE diet_settings ADD COLUMN note_sync_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE diet_settings ADD COLUMN note_sync_workspace_id UUID REFERENCES note_workspaces(id) ON DELETE SET NULL;
