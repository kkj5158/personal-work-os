CREATE TABLE money_statistical_account_purposes (
    user_id UUID NOT NULL,
    account_id UUID NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    purpose VARCHAR(16) NOT NULL CHECK (purpose IN ('INCOME','CONSUMPTION','SAVINGS','INSTALLMENT','UNASSIGNED')),
    version BIGINT NOT NULL CHECK (version >= 0),
    source VARCHAR(16) NOT NULL CHECK (source IN ('BASELINE','OWNER')),
    PRIMARY KEY (user_id, account_id, effective_at),
    FOREIGN KEY (account_id, user_id) REFERENCES money_accounts(id, user_id) ON DELETE CASCADE
);
ALTER TABLE money_statistical_account_purposes ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_statistical_account_purpose_owner ON money_statistical_account_purposes
    USING (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid)
    WITH CHECK (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid);

-- Freeze authoritative fund classification at its existing effective times.
-- An audited subtype correction becomes visible when it was recorded.
WITH boundaries AS (
    SELECT h.user_id, h.account_id, greatest(a.created_at, h.effective_at) AS at
    FROM money_account_fund_group_history h JOIN money_accounts a ON a.id=h.account_id AND a.user_id=h.user_id
    UNION
    SELECT user_id, account_id, recorded_at FROM money_account_subtype_corrections
)
INSERT INTO money_statistical_account_purposes(user_id,account_id,effective_at,purpose,version,source)
SELECT b.user_id,b.account_id,b.at,
    CASE WHEN h.fund_group='SAVINGS' AND coalesce(c.corrected_subtype,h.savings_subtype)='INSTALLMENT' THEN 'INSTALLMENT'
         WHEN h.fund_group='SAVINGS' AND coalesce(c.corrected_subtype,h.savings_subtype)='SAVINGS_ACCOUNT' THEN 'SAVINGS'
         WHEN h.fund_group='LIVING' AND a.role<>'INCOME_HUB' THEN 'CONSUMPTION'
         WHEN h.fund_group='OTHER' AND a.role='INCOME_HUB' AND a.updated_at<=b.at THEN 'INCOME'
         ELSE 'UNASSIGNED' END, 0, 'BASELINE'
FROM boundaries b
JOIN money_accounts a ON a.id=b.account_id AND a.user_id=b.user_id
JOIN LATERAL (
    SELECT * FROM money_account_fund_group_history h
    WHERE h.user_id=b.user_id AND h.account_id=b.account_id AND h.effective_at<=b.at
    ORDER BY h.effective_at DESC LIMIT 1
) h ON true
LEFT JOIN money_account_subtype_corrections c ON c.user_id=h.user_id AND c.account_id=h.account_id
    AND c.effective_at=h.effective_at AND c.recorded_at<=b.at;

CREATE TABLE money_statistical_membership_history (
    user_id UUID NOT NULL,
    account_id UUID NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    archived BOOLEAN NOT NULL,
    include_in_statistics BOOLEAN NOT NULL,
    PRIMARY KEY (user_id, account_id, effective_at),
    FOREIGN KEY (account_id, user_id) REFERENCES money_accounts(id, user_id) ON DELETE CASCADE
);
ALTER TABLE money_statistical_membership_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_statistical_membership_owner ON money_statistical_membership_history
    USING (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid)
    WITH CHECK (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid);

-- Legacy archive/statistics edits lack complete history. Current state is attested at
-- its last write, and earlier unavailable membership is reported as unresolved.
INSERT INTO money_statistical_membership_history
SELECT user_id,id,updated_at,archived,include_in_statistics FROM money_accounts;

CREATE FUNCTION money_record_statistical_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        INSERT INTO money_statistical_membership_history
        VALUES (NEW.user_id,NEW.id,NEW.created_at,NEW.archived,NEW.include_in_statistics);
    ELSIF NEW.archived IS DISTINCT FROM OLD.archived OR NEW.include_in_statistics IS DISTINCT FROM OLD.include_in_statistics THEN
        INSERT INTO money_statistical_membership_history
        VALUES (NEW.user_id,NEW.id,clock_timestamp(),NEW.archived,NEW.include_in_statistics);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER money_record_statistical_membership AFTER INSERT OR UPDATE OF archived,include_in_statistics ON money_accounts
FOR EACH ROW EXECUTE FUNCTION money_record_statistical_membership();
