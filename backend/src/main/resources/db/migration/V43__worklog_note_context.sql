-- Keep journal note identities/content and all existing workspace relationships.
-- New topic notes can be owned directly without a synthetic NOTE SYS workspace.
ALTER TABLE journal_notes ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE journal_notes ADD COLUMN workflow_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE journal_notes ADD CONSTRAINT journal_note_scope CHECK
 ((workspace_id IS NOT NULL AND workflow_owner_id IS NULL) OR
  (workspace_id IS NULL AND workflow_owner_id IS NOT NULL AND type='NOTE'));
CREATE INDEX journal_notes_workflow_owner ON journal_notes(workflow_owner_id,updated_at DESC);
CREATE TABLE worklog_note_references (
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 day DATE NOT NULL, block_id UUID NOT NULL, normalized_name VARCHAR(240) NOT NULL,
 ordinal INTEGER NOT NULL, note_id UUID NOT NULL REFERENCES journal_notes(id) ON DELETE CASCADE,
 excerpt TEXT NOT NULL,
 PRIMARY KEY(user_id,day,block_id,normalized_name,ordinal),
 FOREIGN KEY(user_id,day) REFERENCES workpad_days(user_id,day) ON DELETE CASCADE
);
CREATE INDEX worklog_note_backlinks ON worklog_note_references(note_id,day DESC);
ALTER TABLE worklog_note_references ENABLE ROW LEVEL SECURITY;
