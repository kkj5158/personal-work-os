-- MONEY Mobile fund composition (Drive 105 §5, §13-16, §23). Additive only.
-- fund_group is the owner-chosen primary fund area of a real asset account.
-- It is independent from structural role and from bookkeeping tracking.
-- Backfill derives the group from the existing role so the savings/spending
-- analysis boundary is identical before and after this migration.
ALTER TABLE money_accounts
 ADD COLUMN fund_group VARCHAR(8),
 ADD COLUMN savings_subtype VARCHAR(16),
 ADD COLUMN fund_order INTEGER NOT NULL DEFAULT 0;

UPDATE money_accounts SET
 fund_group=CASE WHEN role IN ('SAVINGS_GATEWAY','SAVINGS','PURPOSE_SAVINGS','PURPOSE_INSTALLMENT') THEN 'SAVINGS'
  WHEN role IN ('SPENDING','FIXED_SPENDING') THEN 'LIVING' ELSE 'OTHER' END,
 savings_subtype=CASE WHEN role='PURPOSE_INSTALLMENT' THEN 'INSTALLMENT'
  WHEN role IN ('SAVINGS_GATEWAY','SAVINGS','PURPOSE_SAVINGS') THEN 'SAVINGS_ACCOUNT' END;

-- Existing insert paths (Web, Bridge setup, tests) do not name a fund group;
-- they keep the role-derived default. Mobile account creation sets it explicitly.
CREATE FUNCTION money_account_default_fund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.fund_group IS NULL THEN
  NEW.fund_group:=CASE WHEN NEW.role IN ('SAVINGS_GATEWAY','SAVINGS','PURPOSE_SAVINGS','PURPOSE_INSTALLMENT') THEN 'SAVINGS'
   WHEN NEW.role IN ('SPENDING','FIXED_SPENDING') THEN 'LIVING' ELSE 'OTHER' END;
  IF NEW.fund_group='SAVINGS' AND NEW.savings_subtype IS NULL THEN
   NEW.savings_subtype:=CASE WHEN NEW.role='PURPOSE_INSTALLMENT' THEN 'INSTALLMENT' ELSE 'SAVINGS_ACCOUNT' END;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER money_account_default_fund BEFORE INSERT ON money_accounts
 FOR EACH ROW EXECUTE FUNCTION money_account_default_fund();

ALTER TABLE money_accounts ALTER COLUMN fund_group SET NOT NULL;
ALTER TABLE money_accounts ADD CONSTRAINT money_accounts_fund_group_check
 CHECK(fund_group IN ('LIVING','SAVINGS','OTHER'));
ALTER TABLE money_accounts ADD CONSTRAINT money_accounts_savings_subtype_check
 CHECK((fund_group='SAVINGS' AND savings_subtype IN ('SAVINGS_ACCOUNT','INSTALLMENT'))
  OR (fund_group<>'SAVINGS' AND savings_subtype IS NULL));
CREATE INDEX idx_money_accounts_fund ON money_accounts(user_id,fund_group,fund_order);

CREATE TABLE money_mobile_settings (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 show_loans_on_home BOOLEAN NOT NULL DEFAULT true,
 version BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE money_mobile_settings ENABLE ROW LEVEL SECURITY;
