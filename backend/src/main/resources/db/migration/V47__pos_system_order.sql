-- User-global shell preference, independent of workspace and browser tab order.
CREATE TABLE pos_system_order (
    owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    system_ids TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pos_system_order ENABLE ROW LEVEL SECURITY;
