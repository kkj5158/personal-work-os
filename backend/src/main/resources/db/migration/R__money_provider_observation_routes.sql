-- Preserve the pre-change assignment of bank observations without editing raw alerts or parse attempts.
-- A NULL account freezes a historically unassigned observation.
CREATE TABLE IF NOT EXISTS money_provider_observation_routes (
    user_id UUID NOT NULL,
    parse_attempt_id UUID NOT NULL,
    raw_event_id UUID NOT NULL,
    account_id UUID,
    PRIMARY KEY(user_id,parse_attempt_id),
    FOREIGN KEY(parse_attempt_id,raw_event_id,user_id)
        REFERENCES money_parse_attempts(id,raw_event_id,user_id) ON DELETE CASCADE,
    FOREIGN KEY(account_id,user_id) REFERENCES money_accounts(id,user_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS money_provider_observation_routes_account_idx
    ON money_provider_observation_routes(user_id,account_id) WHERE account_id IS NOT NULL;
ALTER TABLE money_provider_observation_routes ENABLE ROW LEVEL SECURITY;
