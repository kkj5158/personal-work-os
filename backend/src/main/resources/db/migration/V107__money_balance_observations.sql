-- Observations are evidence, never ledger anchors or transactions.
CREATE TABLE money_balance_observations (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id), account_id UUID NOT NULL,
 amount NUMERIC(19,2) NOT NULL, observed_at TIMESTAMPTZ NOT NULL,
 origin VARCHAR(20) NOT NULL DEFAULT 'USER_MANUAL' CHECK(origin='USER_MANUAL'),
 status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
 note VARCHAR(500), version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,user_id), FOREIGN KEY(account_id,user_id) REFERENCES money_accounts(id,user_id)
);
CREATE INDEX money_observation_account_time ON money_balance_observations(user_id,account_id,observed_at DESC);
CREATE TABLE money_balance_observation_revisions (
 id UUID PRIMARY KEY, observation_id UUID NOT NULL, user_id UUID NOT NULL,
 revision BIGINT NOT NULL, action VARCHAR(12) NOT NULL, reason VARCHAR(500),
 old_value JSONB, new_value JSONB NOT NULL, actor_id UUID NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(observation_id,user_id) REFERENCES money_balance_observations(id,user_id),
 UNIQUE(observation_id,revision)
);
CREATE INDEX money_observation_revision_owner ON money_balance_observation_revisions(user_id,observation_id,revision);
CREATE TABLE money_account_table_preferences (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id), hidden_columns JSONB NOT NULL DEFAULT '[]',
 version BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE money_balance_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_balance_observation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_account_table_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_observation_owner ON money_balance_observations
 USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
 WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
CREATE POLICY money_observation_revision_owner ON money_balance_observation_revisions
 USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
 WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
CREATE POLICY money_account_table_preference_owner ON money_account_table_preferences
 USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
 WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
