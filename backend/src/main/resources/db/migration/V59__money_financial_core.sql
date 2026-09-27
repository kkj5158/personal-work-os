-- Additive Phase 2 financial facts. Existing rows and evidence are unchanged.
ALTER TABLE money_accounts ADD COLUMN memo VARCHAR(2000);
ALTER TABLE money_loans ADD CONSTRAINT money_loans_id_owner UNIQUE(id,user_id);
ALTER TABLE money_loans DROP CONSTRAINT money_loans_status_check;
ALTER TABLE money_loans ADD CONSTRAINT money_loans_status_check
 CHECK(status IN ('ACTIVE','COMPLETED','PAUSED','INACTIVE'));
ALTER TABLE money_balance_checkpoints ADD CONSTRAINT money_balance_checkpoint_owner UNIQUE(id,user_id);

ALTER TABLE money_transactions
 ADD COLUMN loan_id UUID,
 ADD COLUMN principal NUMERIC(19,2),
 ADD COLUMN interest NUMERIC(19,2),
 ADD COLUMN fee NUMERIC(19,2),
 ADD COLUMN balance_checkpoint_id UUID,
 ADD COLUMN calculated_balance NUMERIC(19,2),
 ADD COLUMN verified_balance NUMERIC(19,2),
 ADD FOREIGN KEY(loan_id,user_id) REFERENCES money_loans(id,user_id),
 ADD FOREIGN KEY(balance_checkpoint_id,user_id) REFERENCES money_balance_checkpoints(id,user_id),
 ADD UNIQUE(balance_checkpoint_id);

ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_type_check;
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_shape_check;
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_amount_check;
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_type_check
 CHECK(type IN ('INCOME','EXPENSE','TRANSFER','REFUND','LOAN_PAYMENT','INITIAL_BALANCE','BALANCE_ADJUSTMENT'));
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_amount_check
 CHECK(amount>0 OR type IN ('INITIAL_BALANCE','BALANCE_ADJUSTMENT'));
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_shape_check CHECK
 ((type IN ('INCOME','REFUND','INITIAL_BALANCE','BALANCE_ADJUSTMENT') AND from_account_id IS NULL AND to_account_id IS NOT NULL)
 OR (type IN ('EXPENSE','LOAN_PAYMENT') AND from_account_id IS NOT NULL AND to_account_id IS NULL)
 OR (type='TRANSFER' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id<>to_account_id));
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_financial_detail_check CHECK
 ((type='LOAN_PAYMENT' AND loan_id IS NOT NULL AND balance_checkpoint_id IS NULL
   AND calculated_balance IS NULL AND verified_balance IS NULL AND NOT excluded AND merged_into IS NULL
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
CREATE UNIQUE INDEX idx_money_initial_balance_once ON money_transactions(user_id,to_account_id) WHERE type='INITIAL_BALANCE';
CREATE INDEX idx_money_loan_history ON money_transactions(user_id,loan_id,occurred_at,id) WHERE loan_id IS NOT NULL;
