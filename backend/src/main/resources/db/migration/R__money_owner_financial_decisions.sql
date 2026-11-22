-- Owner decisions are created only in response to an individual, versioned owner command.
CREATE TABLE IF NOT EXISTS money_owner_financial_decisions (
    user_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    actor_id uuid NOT NULL CHECK (actor_id = user_id),
    request_id uuid NOT NULL,
    version bigint NOT NULL CHECK (version > 0),
    declared_type text NOT NULL CHECK (declared_type IN
      ('EXPENSE','INCOME','UNRESOLVED','TRANSFER','SAVINGS','SAVINGS_WITHDRAWAL','LOAN_PAYMENT','LOAN_RECEIPT','REFUND')),
    relation_status text NOT NULL CHECK (relation_status IN
      ('NONE','TRANSFER_PAIR_PENDING','SAVINGS_ROUTE_PENDING','LOAN_SPLIT_PENDING','LOAN_LINK_PENDING',
       'REFUND_ORIGINAL_PENDING','RELATION_CORRECTION_REQUIRED','DIRECTION_REVIEW')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, transaction_id),
    FOREIGN KEY (transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
ALTER TABLE money_owner_financial_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS money_financial_decision_followup
    ON money_owner_financial_decisions(user_id,relation_status,transaction_id) WHERE relation_status <> 'NONE';
