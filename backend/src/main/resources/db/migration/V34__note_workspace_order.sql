-- Preserve the previous created_at/id order for all existing owner workspaces.
ALTER TABLE note_workspaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY created_at, id) - 1 AS position
    FROM note_workspaces
)
UPDATE note_workspaces w SET sort_order = ranked.position FROM ranked WHERE ranked.id = w.id;
CREATE INDEX idx_note_workspaces_owner_order ON note_workspaces(owner_id, sort_order, created_at, id);
