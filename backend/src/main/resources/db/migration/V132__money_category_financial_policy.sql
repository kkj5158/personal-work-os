-- Only verified category identities receive a financial policy. Existing facts are untouched.
CREATE TABLE money_category_financial_policy (
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    semantic_code text NOT NULL CHECK (semantic_code IN ('LOAN_PAYMENT','LOAN_RECEIPT','REFUND')),
    policy_version bigint NOT NULL DEFAULT 1 CHECK (policy_version > 0),
    PRIMARY KEY (user_id,category_id),
    UNIQUE (user_id,semantic_code),
    FOREIGN KEY (category_id,user_id) REFERENCES money_categories(id,user_id)
);
ALTER TABLE money_category_financial_policy ENABLE ROW LEVEL SECURITY;


INSERT INTO money_category_financial_policy(user_id,category_id,semantic_code)
SELECT c.user_id,c.id,p.code FROM money_categories c
JOIN (VALUES ('e81dc720-baf0-4633-ba9a-0f52e6a4d1a4'::uuid,'EXPENSE','LOAN_PAYMENT'),
             ('1c2efa8e-ccff-4779-8319-8c32a1ebba0d'::uuid,'INCOME','REFUND')) p(id,kind,code)
  ON c.id=p.id AND c.kind=p.kind
ON CONFLICT DO NOTHING;

-- Defaults can also be requested by a new owner. Never adopt another category by name.
CREATE FUNCTION money_seed_financial_categories(target_owner uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE policy record; new_id uuid;
BEGIN
    FOR policy IN SELECT * FROM (VALUES ('EXPENSE','대출 상환','LOAN_PAYMENT'),
        ('INCOME','대출금 수령','LOAN_RECEIPT'),('INCOME','환불 금액','REFUND')) x(kind,label,code)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM money_category_financial_policy WHERE user_id=target_owner AND semantic_code=policy.code)
           AND NOT EXISTS (SELECT 1 FROM money_categories WHERE user_id=target_owner AND kind=policy.kind AND name=policy.label) THEN
            INSERT INTO money_categories(id,user_id,name,color,kind,sort_order,seeded)
            SELECT gen_random_uuid(),target_owner,policy.label,'#64748b',policy.kind,coalesce(max(sort_order)+1,0),true
            FROM money_categories WHERE user_id=target_owner AND kind=policy.kind AND parent_id IS NULL
            RETURNING id INTO new_id;
            INSERT INTO money_category_financial_policy(user_id,category_id,semantic_code)
            VALUES(target_owner,new_id,policy.code);
        END IF;
    END LOOP;
END $$;
SELECT money_seed_financial_categories(user_id) FROM (SELECT DISTINCT user_id FROM money_categories) owners;
