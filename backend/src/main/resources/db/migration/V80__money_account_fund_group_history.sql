-- V2: preserve the fund boundary at transaction occurrence time. Additive only.
-- The baseline freezes the pre-V2 classification, including backdated transactions.
CREATE TABLE money_account_fund_group_history (
 user_id UUID NOT NULL,
 account_id UUID NOT NULL,
 fund_group VARCHAR(8) NOT NULL CHECK(fund_group IN ('LIVING','SAVINGS','OTHER')),
 savings_subtype VARCHAR(16),
 effective_at TIMESTAMPTZ NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 account_version BIGINT NOT NULL,
 PRIMARY KEY(user_id,account_id,effective_at),
 FOREIGN KEY(account_id,user_id) REFERENCES money_accounts(id,user_id) ON DELETE CASCADE,
 CHECK((fund_group='SAVINGS' AND savings_subtype IN ('SAVINGS_ACCOUNT','INSTALLMENT'))
  OR (fund_group<>'SAVINGS' AND savings_subtype IS NULL))
);
ALTER TABLE money_account_fund_group_history ENABLE ROW LEVEL SECURITY;
INSERT INTO money_account_fund_group_history(user_id,account_id,fund_group,savings_subtype,effective_at,account_version)
 SELECT user_id,id,fund_group,savings_subtype,'-infinity'::timestamptz,version FROM money_accounts;

CREATE FUNCTION money_record_account_fund_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO money_account_fund_group_history(user_id,account_id,fund_group,savings_subtype,effective_at,account_version)
   VALUES(NEW.user_id,NEW.id,NEW.fund_group,NEW.savings_subtype,'-infinity',NEW.version);
 ELSIF NEW.fund_group IS DISTINCT FROM OLD.fund_group OR NEW.savings_subtype IS DISTINCT FROM OLD.savings_subtype THEN
  INSERT INTO money_account_fund_group_history(user_id,account_id,fund_group,savings_subtype,effective_at,account_version)
   VALUES(NEW.user_id,NEW.id,NEW.fund_group,NEW.savings_subtype,clock_timestamp(),NEW.version);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER money_record_account_fund_history AFTER INSERT OR UPDATE OF fund_group,savings_subtype ON money_accounts
 FOR EACH ROW EXECUTE FUNCTION money_record_account_fund_history();
