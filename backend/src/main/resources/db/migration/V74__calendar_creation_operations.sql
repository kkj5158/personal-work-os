-- Retry identity is scoped to the owner and user operation, never business content.
CREATE TABLE calendar_creation_operations (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    operation_kind VARCHAR(80) NOT NULL,
    response_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, operation_id)
);
