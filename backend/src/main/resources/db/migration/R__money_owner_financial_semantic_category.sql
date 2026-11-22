-- money_owner_financial_decisions itself is created by the preceding repeatable migration.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='money_owner_financial_decisions'::regclass
                   AND attname='semantic_category_id' AND NOT attisdropped) THEN
        ALTER TABLE money_owner_financial_decisions ADD COLUMN semantic_category_id uuid,
            ADD FOREIGN KEY (user_id,semantic_category_id)
                REFERENCES money_category_financial_policy(user_id,category_id);
    END IF;
END $$;
