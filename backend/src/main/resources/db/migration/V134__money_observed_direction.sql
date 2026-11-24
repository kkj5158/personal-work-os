-- An audited source registration carries no owner classification or financial posting.
ALTER TABLE money_transactions ADD COLUMN observed_direction text
    CHECK (observed_direction IN ('EXPENSE','INCOME'));
