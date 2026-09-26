-- Additive Web V1.1. V58 was free in refreshed origin/dev, DEV/PROD history and active worktrees.
-- Existing raw evidence, financial rows and applied migration contents are preserved.
ALTER TABLE money_transactions ADD COLUMN title VARCHAR(240);
ALTER TABLE money_accounts ADD COLUMN include_in_assets BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN include_in_statistics BOOLEAN NOT NULL DEFAULT TRUE;

-- Sparse, per-field overrides. Missing keys inherit live normalized transaction values;
-- explicit JSON null clears an optional field. slot leaves room for a future split model.
CREATE TABLE money_bookkeeping_overrides (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 transaction_id UUID NOT NULL, slot INTEGER NOT NULL DEFAULT 0 CHECK(slot=0),
 overrides JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(overrides)='object'),
 version BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,transaction_id,slot),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
CREATE TABLE money_loans (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name VARCHAR(120) NOT NULL, lender VARCHAR(120) NOT NULL, type VARCHAR(80) NOT NULL,
 original_principal NUMERIC(19,2) CHECK(original_principal>=0),
 remaining_principal NUMERIC(19,2) NOT NULL CHECK(remaining_principal>=0),
 interest_rate NUMERIC(7,4) CHECK(interest_rate>=0 AND interest_rate<=100),
 monthly_payment NUMERIC(19,2) CHECK(monthly_payment>=0),
 payment_day INTEGER CHECK(payment_day BETWEEN 1 AND 31), next_due_date DATE,
 payment_account_id UUID, start_date DATE, maturity_date DATE,
 status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED')),
 memo VARCHAR(2000), version BIGINT NOT NULL DEFAULT 0,
 deleted BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(payment_account_id,user_id) REFERENCES money_accounts(id,user_id),
 CHECK(maturity_date IS NULL OR start_date IS NULL OR maturity_date>=start_date)
);
CREATE INDEX idx_money_loans_owner ON money_loans(user_id,deleted,status);
ALTER TABLE money_raw_notifications ADD COLUMN review_deferred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE money_category_rules ADD COLUMN title_default VARCHAR(240), ADD COLUMN memo_default VARCHAR(2000),
 ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE money_bookkeeping_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_loans ENABLE ROW LEVEL SECURITY;
