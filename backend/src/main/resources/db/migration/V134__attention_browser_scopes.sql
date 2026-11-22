CREATE TABLE attention_browser_scopes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    credential_id UUID NOT NULL REFERENCES attention_credentials(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ
);
ALTER TABLE attention_browser_scopes ENABLE ROW LEVEL SECURITY;
CREATE INDEX attention_browser_scope_owner ON attention_browser_scopes(user_id,credential_id);
