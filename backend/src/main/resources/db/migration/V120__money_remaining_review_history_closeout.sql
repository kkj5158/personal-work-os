-- No cash backfill is performed by this migration. Every closeout remains exact-preview gated.
ALTER TABLE money_transactions ADD COLUMN occurrence_precision varchar(8) NOT NULL DEFAULT 'SECOND'
 CHECK(occurrence_precision IN ('SECOND','DAY'));
ALTER TABLE money_transactions ADD COLUMN transfer_destination_status varchar(30) CHECK(transfer_destination_status IS NULL OR (transfer_destination_status='UNTRACKED_OWNED' AND type='TRANSFER' AND from_account_id IS NOT NULL AND to_account_id IS NULL));
CREATE INDEX money_day_occurrences ON money_transactions(user_id,occurred_at) WHERE occurrence_precision='DAY' AND NOT excluded;
CREATE TABLE money_remaining_closeout_plans (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
 fingerprint varchar(64) NOT NULL,snapshot varchar(64) NOT NULL,payload jsonb NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE money_remaining_closeout_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON money_remaining_closeout_plans FROM anon,authenticated;
CREATE TABLE money_bank_internal_events (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),event_key varchar(64) NOT NULL,
 event_type varchar(50) NOT NULL CHECK(event_type='FACILITY_RECLASSIFICATION'),
 account_id uuid NOT NULL,bank_row_a uuid NOT NULL,bank_row_b uuid NOT NULL,
 raw_a uuid NOT NULL,raw_b uuid NOT NULL,checkpoint_id uuid NOT NULL,facility_id uuid NOT NULL,
 amount numeric(19,2) NOT NULL CHECK(amount>0),active boolean NOT NULL DEFAULT true,version bigint NOT NULL DEFAULT 0,
 request_id uuid NOT NULL,before_sources jsonb NOT NULL,after_sources jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,event_key),
 FOREIGN KEY(user_id,bank_row_a) REFERENCES money_statement_rows(user_id,id),
 FOREIGN KEY(user_id,bank_row_b) REFERENCES money_statement_rows(user_id,id),
 FOREIGN KEY(account_id) REFERENCES money_accounts(id),
 FOREIGN KEY(raw_a) REFERENCES money_raw_notifications(id),FOREIGN KEY(raw_b) REFERENCES money_raw_notifications(id),
 FOREIGN KEY(checkpoint_id) REFERENCES money_balance_checkpoints(id),FOREIGN KEY(facility_id) REFERENCES money_overdraft_facilities(id)
);
ALTER TABLE money_bank_internal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON money_bank_internal_events FROM anon,authenticated;
