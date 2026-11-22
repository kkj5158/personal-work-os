-- Snapshot verified category identities once. Changing a display name never changes income policy.
CREATE TABLE IF NOT EXISTS money_v4_income_categories (
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    basis text NOT NULL CHECK (basis IN ('QUALIFIED', 'FAMILY_SUPPORT', 'REFUND')),
    PRIMARY KEY (user_id, category_id),
    FOREIGN KEY (category_id, user_id) REFERENCES money_categories(id, user_id)
);
ALTER TABLE money_v4_income_categories ENABLE ROW LEVEL SECURITY;

INSERT INTO money_v4_income_categories(user_id, category_id, basis)
SELECT c.user_id, c.id, policy.basis
FROM money_categories c
JOIN (VALUES
    ('d5eceef2-ccb2-4884-88ab-1702f8bb7777'::uuid, 'QUALIFIED'),
    ('1c2efa8e-ccff-4779-8319-8c32a1ebba0d'::uuid, 'REFUND'),
    ('e3199208-443b-4e85-bb6f-d0d103da9fdb'::uuid, 'QUALIFIED'),
    ('2100ef53-6fc4-435b-9991-85b51f46d055'::uuid, 'QUALIFIED'),
    ('5709f47b-47f8-4f9a-b8de-81a2a42fe260'::uuid, 'FAMILY_SUPPORT')
) AS policy(category_id, basis) ON policy.category_id = c.id
WHERE c.kind = 'INCOME'
ON CONFLICT (user_id, category_id) DO NOTHING;
