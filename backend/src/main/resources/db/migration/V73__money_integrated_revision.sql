-- Additive presentation/meaning metadata only. Financial originals are unchanged.
ALTER TABLE money_overview_preferences ADD COLUMN layout JSONB;
ALTER TABLE money_overview_preferences ADD CONSTRAINT money_overview_layout_object CHECK(layout IS NULL OR jsonb_typeof(layout)='object');

CREATE TABLE money_classification_state (
 user_id UUID NOT NULL REFERENCES auth.users(id), transaction_id UUID NOT NULL,
 version BIGINT NOT NULL DEFAULT 0, decision_version BIGINT NOT NULL DEFAULT 0, event_id UUID, origin VARCHAR(24), category_id UUID,
 direct_protected BOOLEAN NOT NULL DEFAULT false, future_reference_excluded BOOLEAN NOT NULL DEFAULT false,
 context_key VARCHAR(64), context_summary JSONB NOT NULL DEFAULT '{}', last_input_key VARCHAR(64), undone_input_key VARCHAR(64),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,transaction_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id),
 CHECK(origin IS NULL OR origin IN ('DIRECT','CONFIRMED','DIRECT_REFERENCE','APPROVED_RULE','AI','RESTORED'))
);
CREATE INDEX money_classification_reference ON money_classification_state(user_id,context_key,updated_at DESC) WHERE origin='DIRECT' AND NOT future_reference_excluded;
CREATE TABLE money_classification_events (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id), transaction_id UUID NOT NULL,
 bundle_id UUID NOT NULL, origin VARCHAR(24) NOT NULL, category_id UUID,
 previous_value JSONB NOT NULL, next_value JSONB NOT NULL, input_key VARCHAR(64),
 evidence JSONB NOT NULL DEFAULT '{}', active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
CREATE INDEX money_classification_history ON money_classification_events(user_id,created_at DESC,id DESC);
CREATE TABLE money_command_outcomes (
 user_id UUID NOT NULL REFERENCES auth.users(id), request_id UUID NOT NULL, command VARCHAR(40) NOT NULL,
 request_hash VARCHAR(64) NOT NULL, status VARCHAR(20) NOT NULL CHECK(status IN ('APPLIED','NOT_APPLIED')),
 result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id)
);
CREATE TABLE money_classification_jobs (
 user_id UUID NOT NULL REFERENCES auth.users(id), transaction_id UUID NOT NULL, version BIGINT NOT NULL DEFAULT 1,
 status VARCHAR(24) NOT NULL DEFAULT 'QUEUED', requested BOOLEAN NOT NULL DEFAULT false, input_key VARCHAR(64), result JSONB NOT NULL DEFAULT '{}',
 due_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,transaction_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id),
 CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','PROTECTED','UNCHANGED','UNDONE'))
);
CREATE INDEX money_classification_due ON money_classification_jobs(due_at) WHERE status='QUEUED';
CREATE FUNCTION money_enqueue_classification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id UUID;
BEGIN
 IF TG_TABLE_NAME='money_transactions' THEN target_id:=NEW.id;
 ELSE
  IF NEW.slot<>0 THEN RETURN NEW; END IF;
  target_id:=NEW.transaction_id;
 END IF;
 IF EXISTS(SELECT 1 FROM money_transactions t WHERE t.user_id=NEW.user_id AND t.id=target_id AND t.type IN ('EXPENSE','INCOME') AND NOT t.excluded AND t.merged_into IS NULL) THEN
  INSERT INTO money_classification_jobs(user_id,transaction_id,due_at) VALUES(NEW.user_id,target_id,now()+interval '1 second')
  ON CONFLICT(user_id,transaction_id) DO UPDATE SET version=money_classification_jobs.version+1,status='QUEUED',due_at=now()+interval '1 second',updated_at=now();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER money_classification_fact AFTER INSERT OR UPDATE OF title,memo,counterparty_text,category_id,excluded,merged_into,from_account_id,to_account_id ON money_transactions FOR EACH ROW EXECUTE FUNCTION money_enqueue_classification();
CREATE TRIGGER money_classification_edit AFTER INSERT OR UPDATE OF overrides ON money_bookkeeping_overrides FOR EACH ROW EXECUTE FUNCTION money_enqueue_classification();
ALTER TABLE money_classification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_classification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_command_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_classification_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE money_ai_conversations (
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),version BIGINT NOT NULL DEFAULT 1,
 title VARCHAR(160) NOT NULL,messages JSONB NOT NULL DEFAULT '[]',references_json JSONB NOT NULL DEFAULT '[]',
 last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),expired_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id,user_id)
);
CREATE INDEX money_ai_conversations_owner ON money_ai_conversations(user_id,last_activity_at DESC,id);
CREATE TABLE money_ai_rule_drafts (
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),conversation_id UUID,
 version BIGINT NOT NULL DEFAULT 1,status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','APPLIED','DISCARDED')),
 target_rule_id UUID,source_version BIGINT NOT NULL DEFAULT 0,summary VARCHAR(500) NOT NULL,rule_input JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(conversation_id,user_id) REFERENCES money_ai_conversations(id,user_id),UNIQUE(id,user_id)
);
CREATE INDEX money_ai_rule_drafts_owner ON money_ai_rule_drafts(user_id,status,updated_at DESC);
ALTER TABLE money_ai_merchants ADD CONSTRAINT money_ai_merchants_id_owner UNIQUE(id,user_id);
CREATE TABLE money_ai_transaction_merchants (
 user_id UUID NOT NULL REFERENCES auth.users(id),transaction_id UUID NOT NULL,merchant_id UUID,
 version BIGINT NOT NULL DEFAULT 1,evidence JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,transaction_id),FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id),
 FOREIGN KEY(merchant_id,user_id) REFERENCES money_ai_merchants(id,user_id)
);
ALTER TABLE money_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_ai_rule_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_ai_transaction_merchants ENABLE ROW LEVEL SECURITY;

CREATE TABLE money_ai_history_runs (
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),rule_id UUID NOT NULL,rule_version BIGINT NOT NULL,
 version BIGINT NOT NULL DEFAULT 1,status VARCHAR(16) NOT NULL DEFAULT 'RUNNING' CHECK(status IN('RUNNING','PAUSED','COMPLETED')),
 scope JSONB NOT NULL,fingerprint VARCHAR(64) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id,user_id)
);
CREATE TABLE money_ai_history_items (
 run_id UUID NOT NULL,user_id UUID NOT NULL REFERENCES auth.users(id),transaction_id UUID NOT NULL,
 status VARCHAR(16) NOT NULL CHECK(status IN('PENDING','APPLIED','PROTECTED','FAILED')),snapshot JSONB NOT NULL,result JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,transaction_id),FOREIGN KEY(run_id,user_id) REFERENCES money_ai_history_runs(id,user_id),
 FOREIGN KEY(transaction_id,user_id) REFERENCES money_transactions(id,user_id)
);
CREATE INDEX money_ai_history_pending ON money_ai_history_items(run_id,transaction_id) WHERE status='PENDING';
ALTER TABLE money_ai_history_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_ai_history_items ENABLE ROW LEVEL SECURITY;
