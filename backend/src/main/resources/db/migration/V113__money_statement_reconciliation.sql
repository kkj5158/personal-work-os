-- Additive provenance only. No existing financial row/owner decision is rewritten.
CREATE TABLE money_statement_uploads (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), account_id uuid NOT NULL REFERENCES money_accounts(id),
 provider varchar(24) NOT NULL, format varchar(8) NOT NULL CHECK(format IN ('PDF','CSV','XLSX')),
 expected_hash varchar(64) NOT NULL, byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 2000000),
 status varchar(16) NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 UNIQUE(user_id,id)
);
CREATE TABLE money_statement_chunks (
 user_id uuid NOT NULL, upload_id uuid NOT NULL, chunk_index integer NOT NULL CHECK(chunk_index BETWEEN 0 AND 79),
 ciphertext bytea NOT NULL, chunk_hash varchar(64) NOT NULL, byte_length integer NOT NULL,
 PRIMARY KEY(user_id,upload_id,chunk_index), FOREIGN KEY(user_id,upload_id) REFERENCES money_statement_uploads(user_id,id)
);
CREATE TABLE money_bank_statements (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), account_id uuid NOT NULL REFERENCES money_accounts(id),
 upload_id uuid NOT NULL, fingerprint varchar(64) NOT NULL, normalized_fingerprint varchar(64) NOT NULL,
 provider varchar(24) NOT NULL, currency varchar(3) NOT NULL, verification varchar(48) NOT NULL,
 date_from date NOT NULL, date_to date NOT NULL, row_count integer NOT NULL, outflow numeric(19,2) NOT NULL,
 inflow numeric(19,2) NOT NULL, opening_balance numeric(19,2) NOT NULL, final_balance numeric(19,2) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id), UNIQUE(user_id,fingerprint),
 FOREIGN KEY(user_id,upload_id) REFERENCES money_statement_uploads(user_id,id)
);
CREATE INDEX money_statements_owner_account_date ON money_bank_statements(user_id,account_id,date_from,date_to);
CREATE TABLE money_statement_rows (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, statement_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES money_accounts(id),
 row_number integer NOT NULL, source_page integer NOT NULL, occurred_at timestamptz NOT NULL,
 direction varchar(3) NOT NULL CHECK(direction IN ('IN','OUT')), amount numeric(19,2) NOT NULL CHECK(amount>0),
 balance_after numeric(19,2) NOT NULL, description varchar(1000) NOT NULL, cash_key varchar(64) NOT NULL,
 UNIQUE(user_id,id), UNIQUE(user_id,statement_id,row_number), FOREIGN KEY(user_id,statement_id) REFERENCES money_bank_statements(user_id,id)
);
CREATE INDEX money_statement_rows_match ON money_statement_rows(user_id,account_id,occurred_at,amount);
CREATE TABLE money_statement_effects (
 user_id uuid NOT NULL REFERENCES auth.users(id), account_id uuid NOT NULL REFERENCES money_accounts(id), cash_key varchar(64) NOT NULL,
 transaction_id uuid NOT NULL REFERENCES money_transactions(id), row_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,account_id,cash_key),
 FOREIGN KEY(user_id,row_id) REFERENCES money_statement_rows(user_id,id)
);
CREATE INDEX money_statement_effect_transaction ON money_statement_effects(user_id,transaction_id);
CREATE TABLE money_reconciliation_runs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, statement_id uuid NOT NULL, snapshot varchar(64) NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id),
 FOREIGN KEY(user_id,statement_id) REFERENCES money_bank_statements(user_id,id)
);
CREATE TABLE money_reconciliation_plans (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, run_id uuid NOT NULL, fingerprint varchar(64) NOT NULL,
 payload jsonb NOT NULL, snapshot varchar(64) NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id),
 FOREIGN KEY(user_id,run_id) REFERENCES money_reconciliation_runs(user_id,id)
);
CREATE INDEX money_recon_run_owner ON money_reconciliation_runs(user_id,created_at);
CREATE INDEX money_recon_plan_owner ON money_reconciliation_plans(user_id,created_at);
-- API is the owner-scoped access boundary. Direct anonymous/authenticated DB roles get no access.
REVOKE ALL ON money_statement_uploads,money_statement_chunks,money_bank_statements,money_statement_rows,
 money_statement_effects,money_reconciliation_runs,money_reconciliation_plans FROM anon,authenticated;

ALTER TABLE money_statement_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_statement_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_statement_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_statement_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_reconciliation_plans ENABLE ROW LEVEL SECURITY;
