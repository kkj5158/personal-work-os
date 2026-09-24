CREATE TABLE money_accounts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(40) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('INCOME_HUB','SPENDING','SAVINGS_GATEWAY','SAVINGS')),
    masked_reference VARCHAR(100),
    suffix VARCHAR(4) CHECK (suffix ~ '^[0-9]{1,4}$'),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,
    UNIQUE (id,user_id)
);
CREATE INDEX idx_money_accounts_owner ON money_accounts(user_id,archived,id);

CREATE TABLE money_raw_notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_package VARCHAR(255),
    notification_key VARCHAR(512),
    device_id VARCHAR(255),
    title TEXT,
    body TEXT,
    big_text TEXT,
    posted_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw_payload JSONB NOT NULL CHECK (jsonb_typeof(raw_payload) = 'object'),
    dedupe_key VARCHAR(200) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    state VARCHAR(30) NOT NULL DEFAULT 'RECEIVED'
        CHECK (state IN ('RECEIVED','PARSED','REVIEW_REQUIRED','PROCESSED','FAILED')),
    processing_version BIGINT NOT NULL DEFAULT 0,
    UNIQUE (id,user_id),
    UNIQUE (user_id,dedupe_key),
    UNIQUE (user_id,content_hash)
);
CREATE INDEX idx_money_raw_owner_received ON money_raw_notifications(user_id,received_at DESC,id);
CREATE INDEX idx_money_raw_owner_state ON money_raw_notifications(user_id,state,received_at,id);

-- Each parse is a new immutable attempt, including failed/unsupported parses.
CREATE TABLE money_parse_attempts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    raw_event_id UUID NOT NULL,
    parser_key VARCHAR(100) NOT NULL,
    parser_version VARCHAR(60) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('PARSED','REVIEW_REQUIRED','FAILED')),
    failure_code VARCHAR(60),
    provider VARCHAR(40),
    direction VARCHAR(3) CHECK (direction IN ('IN','OUT')),
    amount NUMERIC(19,2) CHECK (amount > 0),
    candidate JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id,raw_event_id,user_id),
    FOREIGN KEY (raw_event_id,user_id) REFERENCES money_raw_notifications(id,user_id),
    CHECK ((status = 'FAILED' AND candidate IS NULL AND failure_code IS NOT NULL)
        OR (status <> 'FAILED' AND candidate IS NOT NULL))
);
CREATE INDEX idx_money_parse_raw ON money_parse_attempts(user_id,raw_event_id,created_at,id);
CREATE INDEX idx_money_parse_matching ON money_parse_attempts(user_id,status,amount,direction);

CREATE TABLE money_transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('INCOME','TRANSFER','EXPENSE')),
    from_account_id UUID,
    to_account_id UUID,
    amount NUMERIC(19,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'KRW' CHECK (currency ~ '^[A-Z]{3}$'),
    occurred_at TIMESTAMPTZ NOT NULL,
    counterparty_text VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id,user_id),
    FOREIGN KEY (from_account_id,user_id) REFERENCES money_accounts(id,user_id),
    FOREIGN KEY (to_account_id,user_id) REFERENCES money_accounts(id,user_id),
    CHECK ((type='INCOME' AND from_account_id IS NULL AND to_account_id IS NOT NULL)
        OR (type='EXPENSE' AND from_account_id IS NOT NULL AND to_account_id IS NULL)
        OR (type='TRANSFER' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id <> to_account_id))
);
CREATE INDEX idx_money_tx_owner_time ON money_transactions(user_id,occurred_at DESC,id);
CREATE INDEX idx_money_tx_owner_type ON money_transactions(user_id,type,occurred_at DESC,id);
CREATE INDEX idx_money_tx_from ON money_transactions(user_id,from_account_id,occurred_at DESC);
CREATE INDEX idx_money_tx_to ON money_transactions(user_id,to_account_id,occurred_at DESC);

-- One real transaction can have one, two, or multiple auxiliary notifications.
-- The same raw observation cannot be posted to two different ledger records.
CREATE TABLE money_transaction_sources (
    transaction_id UUID NOT NULL,
    user_id UUID NOT NULL,
    raw_event_id UUID NOT NULL,
    parse_attempt_id UUID,
    relationship VARCHAR(20) NOT NULL CHECK (relationship IN ('PRIMARY','AUXILIARY')),
    evidence JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (transaction_id,raw_event_id),
    UNIQUE (user_id,raw_event_id),
    FOREIGN KEY (transaction_id,user_id) REFERENCES money_transactions(id,user_id),
    FOREIGN KEY (raw_event_id,user_id) REFERENCES money_raw_notifications(id,user_id),
    FOREIGN KEY (parse_attempt_id,raw_event_id,user_id) REFERENCES money_parse_attempts(id,raw_event_id,user_id)
);

ALTER TABLE money_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_raw_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_parse_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_transaction_sources ENABLE ROW LEVEL SECURITY;
