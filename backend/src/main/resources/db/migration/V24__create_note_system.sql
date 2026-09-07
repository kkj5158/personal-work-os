-- NOTE SYSTEM owns no WORK_OS entities. Dates are a route/API boundary only.
CREATE TABLE note_workspaces (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id),
 name VARCHAR(120) NOT NULL, normalized_name VARCHAR(120) NOT NULL,
 description VARCHAR(1000) NOT NULL DEFAULT '', icon VARCHAR(40) NOT NULL DEFAULT 'notebook',
 archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(owner_id, normalized_name)
);
CREATE TABLE workspace_module_settings (
 workspace_id UUID NOT NULL REFERENCES note_workspaces(id) ON DELETE CASCADE,
 module VARCHAR(24) NOT NULL CHECK(module IN ('DAILY_NOTES','ALL_NOTES','RECENT_NOTES','TAGS','CONNECTED_NOTES','GRAPH')),
 enabled BOOLEAN NOT NULL DEFAULT true, position INTEGER NOT NULL, is_default BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(workspace_id,module), CHECK(NOT is_default OR enabled)
);
CREATE UNIQUE INDEX note_one_default_module ON workspace_module_settings(workspace_id) WHERE is_default;
CREATE TABLE note_system_settings (
 owner_id UUID PRIMARY KEY REFERENCES auth.users(id), settings JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE journal_notes (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES note_workspaces(id) ON DELETE CASCADE,
 type VARCHAR(8) NOT NULL CHECK(type IN ('DAILY','NOTE')), journal_date DATE,
 title VARCHAR(240) NOT NULL, content TEXT NOT NULL DEFAULT '', version BIGINT NOT NULL DEFAULT 0,
 pinned_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,journal_date),
 CHECK((type='DAILY' AND journal_date IS NOT NULL) OR (type='NOTE' AND journal_date IS NULL)),
 CHECK(length(content)<=1000000)
);
CREATE INDEX journal_notes_library ON journal_notes(workspace_id,deleted_at,updated_at DESC);
-- A single reservation namespace covers current titles and all historical aliases.
-- Workspace row locks serialize changes across the title and alias tables.
CREATE TABLE journal_note_names (
 workspace_id UUID NOT NULL, normalized_name VARCHAR(240) NOT NULL, note_id UUID NOT NULL,
 PRIMARY KEY(workspace_id,normalized_name),
 FOREIGN KEY(workspace_id,note_id) REFERENCES journal_notes(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE journal_note_aliases (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL, note_id UUID NOT NULL,
 alias VARCHAR(240) NOT NULL, normalized_alias VARCHAR(240) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,normalized_alias),
 FOREIGN KEY(workspace_id,note_id) REFERENCES journal_notes(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE journal_link_occurrences (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL, source_note_id UUID NOT NULL, target_note_id UUID,
 target_title VARCHAR(240) NOT NULL, normalized_target VARCHAR(240) NOT NULL,
 ordinal INTEGER NOT NULL, source_position INTEGER NOT NULL, context_text TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(source_note_id,normalized_target,ordinal),
 FOREIGN KEY(workspace_id,source_note_id) REFERENCES journal_notes(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,target_note_id) REFERENCES journal_notes(workspace_id,id)
);
CREATE INDEX journal_links_incoming ON journal_link_occurrences(workspace_id,target_note_id);
CREATE INDEX journal_links_pending ON journal_link_occurrences(workspace_id,normalized_target) WHERE target_note_id IS NULL;
CREATE TABLE journal_connection_history (
 workspace_id UUID NOT NULL, source_note_id UUID NOT NULL, target_note_id UUID NOT NULL,
 first_connected_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(source_note_id,target_note_id),
 FOREIGN KEY(workspace_id,source_note_id) REFERENCES journal_notes(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,target_note_id) REFERENCES journal_notes(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE note_tags (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES note_workspaces(id) ON DELETE CASCADE,
 name VARCHAR(80) NOT NULL, normalized_name VARCHAR(80) NOT NULL,
 UNIQUE(workspace_id,normalized_name), UNIQUE(workspace_id,id)
);
CREATE TABLE journal_note_tags (
 workspace_id UUID NOT NULL, note_id UUID NOT NULL, tag_id UUID NOT NULL, PRIMARY KEY(note_id,tag_id),
 FOREIGN KEY(workspace_id,note_id) REFERENCES journal_notes(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,tag_id) REFERENCES note_tags(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE journal_note_recent_views (
 workspace_id UUID NOT NULL, note_id UUID NOT NULL, last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,note_id),
 FOREIGN KEY(workspace_id,note_id) REFERENCES journal_notes(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX journal_recent_order ON journal_note_recent_views(workspace_id,last_opened_at DESC);
-- Private, bounded bytea storage uses the existing durable Supabase PostgreSQL
-- infrastructure; no public bucket, ephemeral local disk, or expiring canonical URL.
CREATE TABLE journal_media (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES note_workspaces(id) ON DELETE CASCADE,
 mime_type VARCHAR(40) NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/gif','image/webp')),
 width INTEGER NOT NULL, height INTEGER NOT NULL, data BYTEA NOT NULL CHECK(octet_length(data)<=10485760),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Supabase's public schema must not make these tables accessible through PostgREST.
ALTER TABLE note_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_note_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_note_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_link_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_connection_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_note_recent_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_media ENABLE ROW LEVEL SECURITY;
