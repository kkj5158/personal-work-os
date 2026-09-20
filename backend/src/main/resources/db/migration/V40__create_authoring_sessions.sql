-- Authoring owns its sessions and immutable report/definition snapshots independently of OPS.
CREATE TABLE authoring_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_key VARCHAR(60) NOT NULL,
    spec_version VARCHAR(60) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    current_section_key VARCHAR(100) NOT NULL,
    definition JSONB NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}',
    report JSONB,
    source_session_id UUID,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,
    UNIQUE (id, user_id),
    FOREIGN KEY (source_session_id, user_id) REFERENCES authoring_sessions(id, user_id),
    CHECK ((status = 'COMPLETED' AND completed_at IS NOT NULL AND report IS NOT NULL)
        OR (status = 'IN_PROGRESS' AND completed_at IS NULL AND report IS NULL))
);
CREATE INDEX idx_authoring_sessions_owner_updated ON authoring_sessions(user_id, updated_at DESC, id);
ALTER TABLE authoring_sessions ENABLE ROW LEVEL SECURITY;
