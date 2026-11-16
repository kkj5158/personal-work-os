-- Owner-approved 2026-11-16: 청년 미래 적금 was always an installment.
-- Preserve the original history row and every financial fact. Only this audited
-- baseline receives an explicit correction; future classification changes retain
-- their occurrence-time semantics. Existing SAVINGS boundary readers are unchanged.
CREATE TABLE money_account_subtype_corrections (
 user_id UUID NOT NULL,
 account_id UUID NOT NULL,
 effective_at TIMESTAMPTZ NOT NULL,
 original_subtype VARCHAR(16) NOT NULL,
 corrected_subtype VARCHAR(16) NOT NULL CHECK(corrected_subtype='INSTALLMENT'),
 reason TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,account_id,effective_at),
 FOREIGN KEY(user_id,account_id,effective_at)
  REFERENCES money_account_fund_group_history(user_id,account_id,effective_at)
);
ALTER TABLE money_account_subtype_corrections ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE a money_accounts%ROWTYPE;
BEGIN
 SELECT * INTO a FROM money_accounts
 WHERE id='81410418-e3d6-48bd-a610-30ebac0d3bd7'
 AND user_id IN ('27f164d1-5bce-46a2-b167-64a71b9b953e','53e4f63c-6d19-42e7-acc2-ec5536100fb3')
 FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF a.provider<>'SHINHAN' OR btrim(a.display_name)<>'청년 미래 적금'
  OR a.fund_group<>'SAVINGS' OR a.savings_subtype<>'SAVINGS_ACCOUNT' OR a.version<>1
  OR (SELECT count(*) FROM money_account_fund_group_history WHERE user_id=a.user_id AND account_id=a.id)<>1
  OR NOT EXISTS(SELECT 1 FROM money_account_fund_group_history WHERE user_id=a.user_id AND account_id=a.id
    AND effective_at='-infinity' AND fund_group='SAVINGS' AND savings_subtype='SAVINGS_ACCOUNT' AND account_version=1)
 THEN RAISE EXCEPTION 'Installment correction precondition changed; inspect exact account and history'; END IF;
 INSERT INTO money_account_subtype_corrections(user_id,account_id,effective_at,original_subtype,corrected_subtype,reason)
 VALUES(a.user_id,a.id,'-infinity','SAVINGS_ACCOUNT','INSTALLMENT',
  'Owner confirmed 2026-11-16: 청년 미래 적금 is an installment; correct erroneous baseline classification, preserve source history and financial facts');
 UPDATE money_accounts SET savings_subtype='INSTALLMENT',version=version+1,updated_at=now()
 WHERE user_id=a.user_id AND id=a.id AND version=a.version;
END $$;
