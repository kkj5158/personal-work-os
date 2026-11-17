-- Owner-bound management receipts and immutable, reversible queue plans. No existing data updates.
CREATE TABLE attention_management_operations (
 user_id UUID NOT NULL REFERENCES auth.users(id), request_id UUID NOT NULL,
 request_hash VARCHAR(64) NOT NULL, response JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,request_id)
);
CREATE TABLE attention_management_previews (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 fingerprint VARCHAR(64) NOT NULL, plan JSONB NOT NULL, targets JSONB NOT NULL,
 captured_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 executed_request_id UUID, receipt JSONB
);
CREATE INDEX attention_management_previews_owner ON attention_management_previews(user_id,captured_at);
CREATE TABLE attention_hidden_states (
 user_id UUID NOT NULL REFERENCES auth.users(id), item_id UUID NOT NULL REFERENCES attention_items(id),
 prior_state TEXT NOT NULL, hidden_revision BIGINT NOT NULL,
 hidden_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,item_id)
);
CREATE TABLE attention_key_possession (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 credential_id UUID NOT NULL REFERENCES attention_credentials(id), nonce VARCHAR(64) NOT NULL,
 verified BOOLEAN NOT NULL DEFAULT FALSE, consumed BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE attention_management_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_management_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_hidden_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_key_possession ENABLE ROW LEVEL SECURITY;
