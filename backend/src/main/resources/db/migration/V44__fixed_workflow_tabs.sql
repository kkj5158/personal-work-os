CREATE TABLE workflow_fixed_tabs (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title VARCHAR(120) NOT NULL, revision BIGINT NOT NULL DEFAULT 0,
 blocks TEXT NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workflow_fixed_tabs_owner ON workflow_fixed_tabs(user_id,created_at);
ALTER TABLE workflow_fixed_tabs ENABLE ROW LEVEL SECURITY;
