CREATE TABLE money_tracking_interval_corrections (
 user_id uuid NOT NULL REFERENCES money_tracking_settings(user_id),
 account_id uuid NOT NULL,
 kind varchar(16) NOT NULL CHECK (kind IN ('INCOME','EXPENSE','SAVINGS','INSTALLMENT')),
 valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL,
 selected boolean NOT NULL, version bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,version),
 FOREIGN KEY(account_id,user_id) REFERENCES money_accounts(id,user_id),
 CHECK(valid_from<valid_until)
);
CREATE INDEX money_tracking_interval_lookup ON money_tracking_interval_corrections(user_id,account_id,kind,version DESC);
ALTER TABLE money_tracking_interval_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_tracking_interval_owner ON money_tracking_interval_corrections
 USING (user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);

CREATE OR REPLACE FUNCTION money_tracked_at(owner_id uuid, account uuid, tracking_kind text, at_time timestamptz)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(
   (SELECT c.selected FROM money_tracking_interval_corrections c WHERE c.user_id=owner_id AND c.account_id=account
    AND c.kind=tracking_kind AND c.valid_from<=at_time AND at_time<c.valid_until ORDER BY c.version DESC LIMIT 1),
   (SELECT account=ANY(s.accounts) FROM money_tracking_selections s WHERE s.user_id=owner_id
    AND s.kind=tracking_kind AND s.effective_at<=at_time ORDER BY s.effective_at DESC,s.version DESC LIMIT 1))
$$;
