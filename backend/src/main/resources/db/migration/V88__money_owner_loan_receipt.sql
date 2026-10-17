-- Add a source-backed loan draw without recasting principal as ordinary income.
-- Existing financial facts, sources and classifications are unchanged.
ALTER TABLE money_transactions ALTER COLUMN amount TYPE NUMERIC(24,6);
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_type_check;
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_type_check
 CHECK(type IN ('INCOME','EXPENSE','TRANSFER','REFUND','LOAN_PAYMENT','LOAN_RECEIPT','INITIAL_BALANCE','BALANCE_ADJUSTMENT'));
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_shape_check;
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_shape_check CHECK
 ((type IN ('INCOME','REFUND','LOAN_RECEIPT','INITIAL_BALANCE','BALANCE_ADJUSTMENT') AND from_account_id IS NULL AND to_account_id IS NOT NULL)
 OR (type IN ('EXPENSE','LOAN_PAYMENT') AND from_account_id IS NOT NULL AND to_account_id IS NULL)
 OR (type='TRANSFER' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id<>to_account_id));
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_financial_detail_check;
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_financial_detail_check CHECK
 ((type='LOAN_PAYMENT' AND loan_id IS NOT NULL AND balance_checkpoint_id IS NULL
   AND calculated_balance IS NULL AND verified_balance IS NULL AND merged_into IS NULL
   AND ((principal IS NULL AND interest IS NULL AND fee IS NULL)
     OR (principal IS NOT NULL AND interest IS NOT NULL AND fee IS NOT NULL
       AND principal>=0 AND interest>=0 AND fee>=0 AND amount=principal+interest+fee)))
 OR (type='LOAN_RECEIPT' AND loan_id IS NOT NULL AND principal IS NOT NULL AND principal=amount
   AND currency='KRW' AND interest=0 AND fee=0 AND category_id IS NULL AND refund_of IS NULL
   AND balance_checkpoint_id IS NULL AND calculated_balance IS NULL AND verified_balance IS NULL AND merged_into IS NULL)
 OR (type IN ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') AND balance_checkpoint_id IS NOT NULL
   AND verified_balance IS NOT NULL AND loan_id IS NULL AND principal IS NULL AND interest IS NULL AND fee IS NULL
   AND NOT excluded AND merged_into IS NULL AND category_id IS NULL AND refund_of IS NULL
   AND ((type='INITIAL_BALANCE' AND amount=verified_balance AND calculated_balance IS NULL)
     OR (type='BALANCE_ADJUSTMENT' AND calculated_balance IS NOT NULL AND amount=verified_balance-calculated_balance)))
 OR (type IN ('INCOME','EXPENSE','TRANSFER','REFUND') AND loan_id IS NULL AND principal IS NULL
   AND interest IS NULL AND fee IS NULL AND balance_checkpoint_id IS NULL AND calculated_balance IS NULL AND verified_balance IS NULL));
