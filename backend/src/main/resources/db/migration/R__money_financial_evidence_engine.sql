-- Independent additive metadata. DEV and PROD can receive this schema while
-- their versioned migrations for other products remain on separate releases.
CREATE TABLE IF NOT EXISTS money_financial_rules (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id uuid NOT NULL,
    provider text NOT NULL,
    merchant_key text NOT NULL CHECK (length(merchant_key) BETWEEN 1 AND 500),
    direction text NOT NULL CHECK (direction IN ('IN','OUT')),
    basis_id uuid NOT NULL,
    basis_version bigint NOT NULL,
    active boolean NOT NULL,
    version bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, account_id, provider, merchant_key, direction),
    FOREIGN KEY (account_id, user_id) REFERENCES money_accounts(id, user_id),
    FOREIGN KEY (basis_id, user_id) REFERENCES money_transactions(id, user_id)
);
ALTER TABLE money_financial_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS money_financial_shadow_runs (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    id uuid NOT NULL,
    fingerprint text NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
);
ALTER TABLE money_financial_shadow_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS money_financial_batch_previews (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    id uuid NOT NULL,
    fingerprint text NOT NULL,
    snapshot jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, id)
);
ALTER TABLE money_financial_batch_previews ENABLE ROW LEVEL SECURITY;
