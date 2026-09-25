-- MONEY V1 product. V55 verified free in origin/dev and shared DEV history.
ALTER TABLE money_accounts DROP CONSTRAINT money_accounts_role_check;
ALTER TABLE money_accounts ADD CONSTRAINT money_accounts_role_check CHECK
 (role IN ('INCOME_HUB','SPENDING','FIXED_SPENDING','SAVINGS_GATEWAY','SAVINGS','PURPOSE_SAVINGS','PURPOSE_INSTALLMENT','CASH'));
ALTER TABLE money_accounts ADD COLUMN emoji VARCHAR(32), ADD COLUMN image_data TEXT,
 ADD COLUMN funding_account_id UUID;
ALTER TABLE money_accounts ADD FOREIGN KEY (funding_account_id,user_id) REFERENCES money_accounts(id,user_id);
ALTER TABLE money_accounts ADD CHECK (funding_account_id IS NULL OR funding_account_id<>id);

CREATE TABLE money_categories (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name VARCHAR(80) NOT NULL, color VARCHAR(7) NOT NULL DEFAULT '#64748b', archived BOOLEAN NOT NULL DEFAULT FALSE,
 version BIGINT NOT NULL DEFAULT 0, UNIQUE(id,user_id), UNIQUE(user_id,name)
);
CREATE TABLE money_category_rules (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 merchant VARCHAR(500) NOT NULL, category_id UUID NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 UNIQUE(id,user_id), UNIQUE(user_id,merchant),
 FOREIGN KEY(category_id,user_id) REFERENCES money_categories(id,user_id)
);
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_type_check;
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_check;
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_type_check CHECK(type IN ('INCOME','EXPENSE','TRANSFER','REFUND'));
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_shape_check CHECK
 ((type IN ('INCOME','REFUND') AND from_account_id IS NULL AND to_account_id IS NOT NULL)
 OR (type='EXPENSE' AND from_account_id IS NOT NULL AND to_account_id IS NULL)
 OR (type='TRANSFER' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id<>to_account_id));
ALTER TABLE money_transactions ADD COLUMN category_id UUID, ADD COLUMN memo VARCHAR(2000),
 ADD COLUMN excluded BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN version BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN manual BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN refund_of UUID, ADD COLUMN merged_into UUID;
ALTER TABLE money_transactions ADD FOREIGN KEY(category_id,user_id) REFERENCES money_categories(id,user_id),
 ADD FOREIGN KEY(refund_of,user_id) REFERENCES money_transactions(id,user_id),
 ADD FOREIGN KEY(merged_into,user_id) REFERENCES money_transactions(id,user_id),
 ADD CHECK (refund_of IS NULL OR (type='REFUND' AND refund_of<>id));
CREATE TABLE money_balance_checkpoints (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 account_id UUID NOT NULL, amount NUMERIC(19,2) NOT NULL, verified_at TIMESTAMPTZ NOT NULL,
 note VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,user_id) REFERENCES money_accounts(id,user_id)
);
CREATE INDEX idx_money_balance_account ON money_balance_checkpoints(user_id,account_id,verified_at DESC,created_at DESC);
-- Append-only correction evidence retains the previous ledger interpretation and source associations.
CREATE TABLE money_corrections (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 transaction_id UUID NOT NULL, action VARCHAR(40) NOT NULL, previous_value JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
ALTER TABLE money_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_balance_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_corrections ENABLE ROW LEVEL SECURITY;
