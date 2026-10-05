-- WORK QUEUE owns these additive tables. Existing task/Waiting state is never written.
CREATE TABLE attention_device_authorizations (
 code_hash CHAR(64) PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 challenge VARCHAR(43) NOT NULL, state_hash CHAR(64) NOT NULL, install_id UUID NOT NULL,
 device_name VARCHAR(60) NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX attention_authorizations_owner_idx ON attention_device_authorizations(user_id,created_at);
ALTER TABLE attention_device_authorizations ENABLE ROW LEVEL SECURITY;
CREATE TABLE attention_credentials (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id), install_id UUID,
 kind VARCHAR(10) NOT NULL CHECK (kind IN ('DEVICE','PRODUCER')), device_name VARCHAR(60) NOT NULL,
 namespace VARCHAR(48) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX attention_credentials_owner_idx ON attention_credentials(user_id,install_id);
ALTER TABLE attention_credentials ENABLE ROW LEVEL SECURITY;
