CREATE TABLE money_composition_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    include_family_support BOOLEAN NOT NULL DEFAULT false,
    version BIGINT NOT NULL CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE money_composition_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_composition_preferences_owner ON money_composition_preferences
    USING (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid)
    WITH CHECK (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid);
