-- Preserve historical labels; the existing field now stores an optional one-line description.
ALTER TABLE life_state_entries ALTER COLUMN label DROP NOT NULL;
