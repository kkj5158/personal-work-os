-- Additive AI review metadata. No original notifications, facts, overrides,
-- categories, rules or tracking selections are initialized or rewritten.
-- V69 reserved after origin/dev V68, active-worktree and shared DEV audit.
CREATE TABLE money_ai_events (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 subject_id UUID NOT NULL, kind VARCHAR(40) NOT NULL,
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 active BOOLEAN NOT NULL DEFAULT TRUE, idempotency_key VARCHAR(128),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
CREATE INDEX money_ai_events_owner_subject ON money_ai_events(user_id,subject_id,created_at DESC);
CREATE TABLE money_ai_merchants (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 descriptor VARCHAR(500) NOT NULL, name VARCHAR(160) NOT NULL,
 region VARCHAR(120), aliases JSONB NOT NULL DEFAULT '[]',
 evidence JSONB NOT NULL DEFAULT '{}', version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,descriptor),
 CHECK(jsonb_typeof(aliases)='array'), CHECK(jsonb_typeof(evidence)='object')
);
CREATE TABLE money_ai_lookups (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 query VARCHAR(640) NOT NULL, status VARCHAR(24) NOT NULL,
 result JSONB NOT NULL DEFAULT '{}', error_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(result)='object')
);
CREATE INDEX money_ai_lookups_owner_query ON money_ai_lookups(user_id,query,created_at DESC);
CREATE TABLE money_ai_settings (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id), version BIGINT NOT NULL DEFAULT 0,
 automatic_rules BOOLEAN NOT NULL DEFAULT FALSE, external_lookup BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE money_ai_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_ai_merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_ai_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_ai_settings ENABLE ROW LEVEL SECURITY;
