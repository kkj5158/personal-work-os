ALTER TABLE money_tracking_accounts
  DROP CONSTRAINT money_tracking_accounts_slot_check,
  DROP CONSTRAINT money_tracking_accounts_kind_check,
  ALTER COLUMN slot TYPE integer,
  ALTER COLUMN kind TYPE varchar(16),
  ADD CHECK (slot > 0),
  ADD CHECK (kind IN ('INCOME','EXPENSE','SAVINGS','INSTALLMENT'));

CREATE TABLE money_tracking_selections (
  user_id uuid NOT NULL REFERENCES money_tracking_settings(user_id),
  kind varchar(16) NOT NULL CHECK (kind IN ('INCOME','EXPENSE','SAVINGS','INSTALLMENT')),
  effective_at timestamptz NOT NULL,
  version bigint NOT NULL,
  accounts uuid[] NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,kind,effective_at,version)
);
ALTER TABLE money_tracking_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_tracking_selection_owner ON money_tracking_selections
  USING (user_id = (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);

-- The last settings write attests the two lists that existed then.
INSERT INTO money_tracking_selections(user_id,kind,effective_at,version,accounts)
SELECT s.user_id,k.kind,s.updated_at,s.version,ARRAY(
  SELECT a.account_id FROM money_tracking_accounts a WHERE a.user_id=s.user_id AND a.kind=k.kind ORDER BY a.slot)
FROM money_tracking_settings s CROSS JOIN (VALUES ('INCOME'),('EXPENSE')) k(kind);

CREATE FUNCTION money_tracked_at(owner_id uuid, account uuid, tracking_kind text, at_time timestamptz)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT account=ANY(s.accounts) FROM money_tracking_selections s
  WHERE s.user_id=owner_id AND s.kind=tracking_kind AND s.effective_at<=at_time
  ORDER BY s.effective_at DESC,s.version DESC LIMIT 1
$$;

-- Stock tracking begins empty at rollout. Past opt-in cannot be inferred from fund roles.
INSERT INTO money_tracking_settings(user_id)
SELECT DISTINCT user_id FROM money_accounts ON CONFLICT DO NOTHING;
INSERT INTO money_tracking_selections(user_id,kind,effective_at,version,accounts)
SELECT s.user_id,k.kind,statement_timestamp(),s.version,'{}'::uuid[]
FROM money_tracking_settings s CROSS JOIN (VALUES ('SAVINGS'),('INSTALLMENT')) k(kind);

CREATE FUNCTION money_expire_stock_selection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text; next_version bigint; remaining uuid[]; previous uuid[];
BEGIN
  IF NEW.fund_group IS NOT DISTINCT FROM OLD.fund_group AND NEW.savings_subtype IS NOT DISTINCT FROM OLD.savings_subtype
     AND NEW.archived IS NOT DISTINCT FROM OLD.archived THEN RETURN NEW; END IF;
  FOR k IN SELECT kind FROM money_tracking_accounts WHERE user_id=NEW.user_id AND account_id=NEW.id
    AND (NEW.archived OR (kind IN ('SAVINGS','INSTALLMENT') AND
      (NEW.fund_group<>'SAVINGS' OR NEW.savings_subtype IS DISTINCT FROM CASE kind WHEN 'SAVINGS' THEN 'SAVINGS_ACCOUNT' ELSE 'INSTALLMENT' END)))
  LOOP
    SELECT array_agg(account_id ORDER BY slot) INTO previous FROM money_tracking_accounts WHERE user_id=NEW.user_id AND kind=k;
    DELETE FROM money_tracking_accounts WHERE user_id=NEW.user_id AND kind=k AND account_id=NEW.id;
    remaining:=array_remove(previous,NEW.id);
    UPDATE money_tracking_settings SET version=version+1,updated_at=clock_timestamp()
      WHERE user_id=NEW.user_id RETURNING version INTO next_version;
    INSERT INTO money_tracking_selections(user_id,kind,effective_at,version,accounts)
      VALUES(NEW.user_id,k,clock_timestamp(),next_version,remaining);
    INSERT INTO money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value)
      VALUES(gen_random_uuid(),NEW.user_id,NEW.id,'TRACKING',jsonb_build_object(k,previous),jsonb_build_object(k,remaining,'version',next_version));
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER money_expire_stock_selection AFTER UPDATE OF fund_group,savings_subtype,archived ON money_accounts
  FOR EACH ROW EXECUTE FUNCTION money_expire_stock_selection();
