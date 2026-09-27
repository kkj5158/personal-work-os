-- Phase 3 additive meaning-layer storage. V60 checked against refreshed dev,
-- active worktrees and shared DEV history (latest V59) before assignment.
-- No financial facts, raw notifications or existing overrides are rewritten.
ALTER TABLE money_categories
 ADD COLUMN kind VARCHAR(8) NOT NULL DEFAULT 'EXPENSE' CHECK(kind IN ('EXPENSE','INCOME')),
 ADD COLUMN emoji VARCHAR(32), ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN seeded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE money_tracking_settings (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 version BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE money_tracking_accounts (
 user_id UUID NOT NULL REFERENCES money_tracking_settings(user_id),
 kind VARCHAR(8) NOT NULL CHECK(kind IN ('EXPENSE','INCOME')),
 slot SMALLINT NOT NULL CHECK(slot BETWEEN 1 AND 5), account_id UUID NOT NULL,
 PRIMARY KEY(user_id,kind,slot), UNIQUE(user_id,kind,account_id),
 FOREIGN KEY(account_id,user_id) REFERENCES money_accounts(id,user_id)
);

-- NULL conditions retain the prior exact-merchant normalization contract.
-- Rules edited/created by the new editor have explicit AND conditions and
-- produce only Bookkeeping defaults. Existing normalized facts stay unchanged.
ALTER TABLE money_category_rules
 ALTER COLUMN merchant DROP NOT NULL, ALTER COLUMN category_id DROP NOT NULL,
 ADD COLUMN name VARCHAR(120), ADD COLUMN conditions JSONB,
 ADD COLUMN priority INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','INACTIVE')),
 ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT 'MANUAL' CHECK(origin IN ('MANUAL','AI_APPROVED')),
 ADD CHECK(conditions IS NULL OR jsonb_typeof(conditions)='array');
CREATE TABLE money_rule_projections (
 user_id UUID NOT NULL, transaction_id UUID NOT NULL,
 defaults JSONB NOT NULL CHECK(jsonb_typeof(defaults)='object'),
 evidence JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,transaction_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
CREATE TABLE money_meaning_audit (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 subject_id UUID NOT NULL, action VARCHAR(40) NOT NULL,
 previous_value JSONB NOT NULL, next_value JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE money_review_decisions (
 user_id UUID NOT NULL, transaction_id UUID NOT NULL,
 transaction_version BIGINT NOT NULL, projection_version BIGINT NOT NULL DEFAULT 0,
 override_version BIGINT NOT NULL DEFAULT 0, displayed JSONB NOT NULL,
 completed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,transaction_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
ALTER TABLE money_tracking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_tracking_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_rule_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_meaning_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_review_decisions ENABLE ROW LEVEL SECURITY;
