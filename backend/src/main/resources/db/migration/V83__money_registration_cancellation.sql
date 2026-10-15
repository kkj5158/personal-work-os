-- Registration cancellation preserves the canonical LOAN_PAYMENT fact and all split/owner constraints.
-- Only its excluded flag becomes legal. INITIAL_BALANCE/BALANCE_ADJUSTMENT remain non-excludable.
-- Existing rows are not transformed; Flyway runs both DDL statements in one PostgreSQL transaction.
-- Older readers already exclude excluded repayments from history/flows; remaining principal is changed
-- only by the versioned owner-locked registration command in the same transaction as the fact.
-- To restore the prior constraint, first restore every cancelled repayment through that command.
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_financial_detail_check;
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_financial_detail_check CHECK
 ((type='LOAN_PAYMENT' AND loan_id IS NOT NULL AND balance_checkpoint_id IS NULL
   AND calculated_balance IS NULL AND verified_balance IS NULL AND merged_into IS NULL
   AND ((principal IS NULL AND interest IS NULL AND fee IS NULL)
     OR (principal IS NOT NULL AND interest IS NOT NULL AND fee IS NOT NULL
       AND principal>=0 AND interest>=0 AND fee>=0 AND amount=principal+interest+fee)))
 OR (type IN ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') AND balance_checkpoint_id IS NOT NULL
   AND verified_balance IS NOT NULL AND loan_id IS NULL AND principal IS NULL AND interest IS NULL AND fee IS NULL
   AND NOT excluded AND merged_into IS NULL AND category_id IS NULL AND refund_of IS NULL
   AND ((type='INITIAL_BALANCE' AND amount=verified_balance AND calculated_balance IS NULL)
     OR (type='BALANCE_ADJUSTMENT' AND calculated_balance IS NOT NULL AND amount=verified_balance-calculated_balance)))
 OR (type IN ('INCOME','EXPENSE','TRANSFER','REFUND') AND loan_id IS NULL AND principal IS NULL
   AND interest IS NULL AND fee IS NULL AND balance_checkpoint_id IS NULL AND calculated_balance IS NULL AND verified_balance IS NULL));

-- Durable target selection is UI metadata, separate from financial facts and saved classifications.
CREATE TABLE money_workbench_selections (
 user_id UUID NOT NULL, scope VARCHAR(40) NOT NULL CHECK(scope IN
 ('book-workbench-EXPENSE','book-workbench-INCOME','book-monthly-EXPENSE','book-monthly-INCOME')),
 transaction_id UUID NOT NULL, selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,scope,transaction_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
ALTER TABLE money_workbench_selections ENABLE ROW LEVEL SECURITY;
