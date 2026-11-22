-- An existing device receives rich capture only through a separate owner grant.
CREATE TABLE attention_desktop_capture_consents (
    scope_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    credential_id UUID NOT NULL REFERENCES attention_credentials(id),
    environment VARCHAR(4) NOT NULL CHECK (environment IN ('DEV','PROD')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ
);
ALTER TABLE attention_desktop_capture_consents ENABLE ROW LEVEL SECURITY;
CREATE INDEX attention_desktop_capture_owner_idx ON attention_desktop_capture_consents(user_id, environment);

-- Reuse the append-only V4 report/head tables. Desktop targets use device consent;
-- the existing managed signing route still requires an Ed25519 public key.
ALTER TABLE attention_content_targets
    ADD COLUMN desktop_scope_id UUID REFERENCES attention_desktop_capture_consents(scope_id),
    ALTER COLUMN public_key DROP NOT NULL,
    ADD CONSTRAINT attention_content_target_authority CHECK (
        (desktop_scope_id IS NULL AND public_key IS NOT NULL) OR
        (desktop_scope_id IS NOT NULL AND public_key IS NULL)
    );
