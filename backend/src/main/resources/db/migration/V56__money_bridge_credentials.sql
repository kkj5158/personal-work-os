-- Additive Bridge transport credentials. V56 was free in origin/dev and shared DEV.
CREATE TABLE money_bridge_enrollments (
 code_hash CHAR(64) PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX money_bridge_enrollments_owner ON money_bridge_enrollments(user_id);
CREATE TABLE money_bridge_devices (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 install_id UUID NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 last_received_at TIMESTAMPTZ,
 last_status VARCHAR(20),
 accepted_count BIGINT NOT NULL DEFAULT 0,
 duplicate_count BIGINT NOT NULL DEFAULT 0,
 rejected_count BIGINT NOT NULL DEFAULT 0,
 UNIQUE(user_id,install_id)
);
ALTER TABLE money_bridge_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_bridge_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON money_bridge_enrollments, money_bridge_devices FROM anon, authenticated;
