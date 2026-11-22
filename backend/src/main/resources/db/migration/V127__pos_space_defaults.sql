CREATE TABLE pos_space_defaults (
    owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    defaults JSONB NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0)
);

ALTER TABLE pos_space_defaults ENABLE ROW LEVEL SECURITY;
