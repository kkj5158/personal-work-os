-- Explicit owner-selected classification drafts, separate from immutable AI revisions and ledger facts.
CREATE TABLE money_classification_choices (
 user_id UUID NOT NULL,transaction_id UUID NOT NULL,category_id UUID NOT NULL,
 draft_id UUID,revision BIGINT,expected_stamp VARCHAR(64) NOT NULL,
 original_stamp VARCHAR(64),compared BOOLEAN NOT NULL DEFAULT false,
 snapshot JSONB NOT NULL DEFAULT '{}',
 this_transaction_only BOOLEAN NOT NULL DEFAULT false,source VARCHAR(24) NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,transaction_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id),
 FOREIGN KEY(draft_id,user_id) REFERENCES money_classification_drafts(id,user_id),
 FOREIGN KEY(category_id,user_id) REFERENCES money_categories(id,user_id)
);
ALTER TABLE money_classification_choices ENABLE ROW LEVEL SECURITY;
