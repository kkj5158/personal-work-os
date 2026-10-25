-- Additive semantic state. Legacy rows retain their confirmed meaning and identity.
ALTER TABLE money_transactions ADD COLUMN meaning_state VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED'
 CHECK (meaning_state IN ('CONFIRMED','UNRESOLVED'));
ALTER TABLE money_transactions ADD CONSTRAINT money_unresolved_cash_shape CHECK
 (meaning_state='CONFIRMED' OR (type IN ('EXPENSE','INCOME') AND loan_id IS NULL AND refund_of IS NULL));
-- A partial transfer represents only the observed leg; no receiving cash is invented.
ALTER TABLE money_transactions DROP CONSTRAINT money_transactions_shape_check;
ALTER TABLE money_transactions ADD CONSTRAINT money_transactions_shape_check CHECK
 ((type IN ('INCOME','REFUND','LOAN_RECEIPT','INITIAL_BALANCE','BALANCE_ADJUSTMENT') AND from_account_id IS NULL AND to_account_id IS NOT NULL)
 OR (type IN ('EXPENSE','LOAN_PAYMENT') AND from_account_id IS NOT NULL AND to_account_id IS NULL)
 OR (type='TRANSFER' AND (from_account_id IS NOT NULL OR to_account_id IS NOT NULL)
     AND (from_account_id IS NULL OR to_account_id IS NULL OR from_account_id<>to_account_id)));
CREATE INDEX money_unresolved_owner_time ON money_transactions(user_id,occurred_at,id)
 WHERE meaning_state='UNRESOLVED' AND NOT excluded AND merged_into IS NULL;
