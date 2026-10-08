-- Additive, owner-scoped recommendation metadata. No financial facts or legacy outcomes are rewritten.
CREATE TABLE money_recommendation_runs (
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),request_id UUID,
 request_hash VARCHAR(64),scope VARCHAR(16) NOT NULL,filters JSONB NOT NULL DEFAULT '{}',
 fingerprint VARCHAR(64) NOT NULL,policy_version VARCHAR(40) NOT NULL,
 status VARCHAR(40) NOT NULL DEFAULT 'PREVIEW_REQUIRED',excluded JSONB NOT NULL DEFAULT '[]',
 confirmation_required BOOLEAN NOT NULL DEFAULT false,max_cost NUMERIC(18,8) NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),UNIQUE(user_id,request_id)
);
CREATE TABLE money_recommendation_items (
 id UUID PRIMARY KEY,user_id UUID NOT NULL,run_id UUID NOT NULL,transaction_id UUID NOT NULL,
 snapshot JSONB NOT NULL,stamp VARCHAR(64) NOT NULL,status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
 explanation VARCHAR(500) NOT NULL DEFAULT '',context_version BIGINT NOT NULL DEFAULT 0,
 result JSONB NOT NULL DEFAULT '{}',attempt_id UUID,lease_until TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,user_id) REFERENCES money_recommendation_runs(id,user_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id),
 UNIQUE(user_id,run_id,transaction_id),UNIQUE(id,user_id)
);
CREATE INDEX money_recommendation_due ON money_recommendation_items(status,created_at);
CREATE TABLE money_classification_drafts (
 id UUID PRIMARY KEY,user_id UUID NOT NULL,transaction_id UUID NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0,candidate_revision BIGINT,
 status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',selected BOOLEAN NOT NULL DEFAULT true,
 context_version BIGINT NOT NULL DEFAULT 0,explanation VARCHAR(500) NOT NULL DEFAULT '',
 saved_event_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id),
 UNIQUE(user_id,transaction_id),UNIQUE(id,user_id)
);
CREATE TABLE money_classification_draft_revisions (
 user_id UUID NOT NULL,draft_id UUID NOT NULL,revision BIGINT NOT NULL,
 item_id UUID NOT NULL,category_id UUID,origin VARCHAR(24) NOT NULL,
 result JSONB NOT NULL,snapshot JSONB NOT NULL,stamp VARCHAR(64) NOT NULL,
 context_version BIGINT NOT NULL,disposition VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,draft_id,revision),
 FOREIGN KEY(draft_id,user_id) REFERENCES money_classification_drafts(id,user_id),
 FOREIGN KEY(item_id,user_id) REFERENCES money_recommendation_items(id,user_id)
);
CREATE TABLE money_recommendation_saves (
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),request_id UUID NOT NULL,
 request_hash VARCHAR(64) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_id),UNIQUE(id,user_id)
);
CREATE TABLE money_recommendation_save_items (
 id UUID PRIMARY KEY,user_id UUID NOT NULL,save_id UUID NOT NULL,transaction_id UUID NOT NULL,
 command JSONB NOT NULL,status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
 result JSONB NOT NULL DEFAULT '{}',event_id UUID,attempts INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(save_id,user_id) REFERENCES money_recommendation_saves(id,user_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id),
 UNIQUE(user_id,save_id,transaction_id)
);
CREATE TABLE money_recommendation_usage (
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),item_id UUID NOT NULL,
 model VARCHAR(100) NOT NULL,price_version VARCHAR(100) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'HELD',reserved_cost NUMERIC(18,8) NOT NULL CHECK(reserved_cost>=0),
 actual_cost NUMERIC(18,8),input_tokens BIGINT,output_tokens BIGINT,provider_request_id VARCHAR(160),
 day DATE NOT NULL,month DATE NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(item_id,user_id) REFERENCES money_recommendation_items(id,user_id),
 CHECK(status IN ('HELD','ACTUAL','UNCERTAIN','RELEASED'))
);
CREATE INDEX money_recommendation_usage_period ON money_recommendation_usage(user_id,day,month,status);
CREATE TABLE money_recommendation_decisions (
 id UUID PRIMARY KEY,user_id UUID NOT NULL,request_id UUID NOT NULL,request_hash VARCHAR(64) NOT NULL,
 draft_id UUID NOT NULL,decision VARCHAR(32) NOT NULL,result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,request_id),
 FOREIGN KEY(draft_id,user_id) REFERENCES money_classification_drafts(id,user_id)
);
ALTER TABLE money_recommendation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_recommendation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_classification_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_classification_draft_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_recommendation_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_recommendation_save_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_recommendation_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_recommendation_decisions ENABLE ROW LEVEL SECURITY;
