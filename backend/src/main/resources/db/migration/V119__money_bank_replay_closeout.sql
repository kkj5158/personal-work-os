-- Additive provenance and reversible closeout receipts. No historical financial rewrite.
ALTER TABLE money_statement_uploads DROP CONSTRAINT money_statement_uploads_format_check;
ALTER TABLE money_statement_uploads ALTER COLUMN format TYPE varchar(16);
ALTER TABLE money_statement_uploads ADD CONSTRAINT money_statement_uploads_format_check
 CHECK(format IN ('PDF','CSV','XLSX','HTML_XLS','NATIVE_JSON'));
ALTER TABLE money_bank_statements ADD COLUMN original_source_hash varchar(64);
CREATE UNIQUE INDEX money_statement_original_source ON money_bank_statements(user_id,account_id,original_source_hash)
 WHERE original_source_hash IS NOT NULL;
ALTER TABLE money_statement_rows DROP CONSTRAINT money_statement_rows_amount_check;
ALTER TABLE money_statement_rows ADD CONSTRAINT money_statement_rows_amount_check CHECK(amount>=0);
ALTER TABLE money_statement_rows ADD COLUMN bank_row_hash varchar(64);
ALTER TABLE money_statement_rows ADD COLUMN source_sheet integer;
ALTER TABLE money_statement_rows ADD COLUMN native_source_row integer;
ALTER TABLE money_statement_rows ADD COLUMN time_precision varchar(8) NOT NULL DEFAULT 'SECOND' CHECK(time_precision IN ('SECOND','DAY'));
CREATE UNIQUE INDEX money_statement_native_row ON money_statement_rows(user_id,statement_id,bank_row_hash) WHERE bank_row_hash IS NOT NULL;
CREATE TABLE money_reconciliation_changes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), request_id uuid NOT NULL,
 row_id uuid NOT NULL, subject_id uuid NOT NULL, action varchar(40) NOT NULL,
 before_value jsonb NOT NULL, after_value jsonb NOT NULL, undone_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,row_id) REFERENCES money_statement_rows(user_id,id)
);
CREATE INDEX money_reconciliation_changes_request ON money_reconciliation_changes(user_id,request_id);
ALTER TABLE money_reconciliation_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON money_reconciliation_changes FROM anon,authenticated;
CREATE TABLE money_overdraft_facilities (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 loan_id uuid NOT NULL, account_id uuid NOT NULL, facility_limit numeric(19,2) NOT NULL CHECK(facility_limit>0),
 source_row_id uuid NOT NULL, active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,loan_id),UNIQUE(user_id,account_id),
 FOREIGN KEY(loan_id,user_id) REFERENCES money_loans(id,user_id),
 FOREIGN KEY(account_id,user_id) REFERENCES money_accounts(id,user_id),
 FOREIGN KEY(user_id,source_row_id) REFERENCES money_statement_rows(user_id,id)
);
ALTER TABLE money_overdraft_facilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON money_overdraft_facilities FROM anon,authenticated;
CREATE INDEX money_bank_account_clock ON money_meaning_audit(user_id,subject_id,created_at DESC,id DESC)
 WHERE action='BANK_ACCOUNT_CLOCK';
