-- Additive isolated voice namespace. No existing financial, sleep or workflow rows change.
-- Coordinated release 2026-10-28: forward-renumbered from NEVER-APPLIED V89 after DEV/PROD readback.
CREATE TABLE morning_voice_owner_guards (
    owner_id UUID PRIMARY KEY
);
CREATE TABLE morning_voice_sessions (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    occurrence_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    provider VARCHAR(40) NOT NULL,
    release_name VARCHAR(120) NOT NULL,
    approved_version VARCHAR(160) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    credential_issued_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    session_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    provider_conversation_id VARCHAR(200),
    client_connected_at TIMESTAMP WITH TIME ZONE,
    client_ended_at TIMESTAMP WITH TIME ZONE,
    usage_status VARCHAR(40) NOT NULL DEFAULT 'UNRECONCILED',
    duration_seconds BIGINT,
    input_tokens BIGINT,
    output_tokens BIGINT,
    audio_tokens BIGINT,
    provider_credits NUMERIC(24,8),
    reserved_maximum_cost NUMERIC(24,8) NOT NULL CHECK (reserved_maximum_cost >= 0),
    estimated_cost NUMERIC(24,8),
    final_reported_cost NUMERIC(24,8),
    currency VARCHAR(12) NOT NULL,
    pricing_version VARCHAR(120) NOT NULL,
    UNIQUE(owner_id, occurrence_id),
    UNIQUE(owner_id, attempt_id)
);
CREATE INDEX morning_voice_owner_created_idx ON morning_voice_sessions(owner_id, created_at);
CREATE TABLE morning_voice_client_events (
    owner_id UUID NOT NULL,
    event_id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES morning_voice_sessions(id),
    event_type VARCHAR(32) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY(owner_id, event_id)
);
-- Match existing server-only credential tables: never expose ledger mutation via Supabase REST.
ALTER TABLE morning_voice_owner_guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_voice_client_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON morning_voice_owner_guards, morning_voice_sessions, morning_voice_client_events FROM PUBLIC, anon, authenticated;
