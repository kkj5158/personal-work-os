-- Default Start Time Criterion (post-production iteration 1).
-- Invariant: if a user has at least one active criterion, exactly one of
-- their active criteria is the default; if none are active, there is
-- naturally no default. Enforced in application code
-- (StartTimeCriterionService); this migration adds the storage and a
-- partial unique index guaranteeing at most one default row per user at
-- the database level as a defense-in-depth backstop.

ALTER TABLE start_time_criteria
    ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX uq_start_time_criteria_default
    ON start_time_criteria (user_id)
    WHERE is_default = TRUE;

-- Backfill: pre-existing users may already have active criteria with no
-- default recorded yet (the concept didn't exist before this migration).
-- For each user with at least one active criterion, promote exactly one
-- (their lowest sort_order, tied-break by created_at) to default, so the
-- invariant holds immediately for existing data rather than only for
-- criteria created after this migration.
UPDATE start_time_criteria s
SET is_default = TRUE
FROM (
    SELECT DISTINCT ON (user_id) id
    FROM start_time_criteria
    WHERE is_active = TRUE
    ORDER BY user_id, sort_order ASC, created_at ASC
) chosen
WHERE s.id = chosen.id;
