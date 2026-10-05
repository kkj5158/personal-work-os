-- WORK QUEUE owns these additive tables. Existing task/Waiting state is never written.
CREATE TABLE attention_device_authorizations (
 code_hash CHAR(64) PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 challenge VARCHAR(43) NOT NULL, state_hash CHAR(64) NOT NULL, install_id UUID NOT NULL,
 device_name VARCHAR(60) NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX attention_authorizations_owner_idx ON attention_device_authorizations(user_id,created_at);
ALTER TABLE attention_device_authorizations ENABLE ROW LEVEL SECURITY;
CREATE TABLE attention_credentials (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id), install_id UUID,
 kind VARCHAR(10) NOT NULL CHECK (kind IN ('DEVICE','PRODUCER')), device_name VARCHAR(60) NOT NULL,
 namespace VARCHAR(48) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX attention_credentials_owner_idx ON attention_credentials(user_id,install_id);
ALTER TABLE attention_credentials ENABLE ROW LEVEL SECURITY;
CREATE TABLE attention_queues (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id), revision BIGINT NOT NULL DEFAULT 0,
 next_sequence BIGINT NOT NULL DEFAULT 1
);
ALTER TABLE attention_queues ENABLE ROW LEVEL SECURITY;
CREATE TABLE attention_lanes (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES attention_queues(user_id),
 name VARCHAR(20) NOT NULL, sort_order INTEGER NOT NULL CHECK(sort_order BETWEEN 0 AND 2),
 revision BIGINT NOT NULL DEFAULT 0, UNIQUE(id,user_id)
);
ALTER TABLE attention_lanes ENABLE ROW LEVEL SECURITY;
CREATE TABLE attention_items (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES attention_queues(user_id),
 action VARCHAR(100) NOT NULL, project_id UUID, project_label VARCHAR(40) NOT NULL DEFAULT '', work_task_id UUID,
 status VARCHAR(12) NOT NULL CHECK(status IN ('OPEN','COMPLETED','DISMISSED')),
 lane_id UUID NOT NULL, stack_order INTEGER NOT NULL, lane_order INTEGER NOT NULL,
 attention_sequence BIGINT NOT NULL, revision BIGINT NOT NULL DEFAULT 0,
 source TEXT NOT NULL, source_key CHAR(64) NOT NULL, producer_namespace VARCHAR(48) NOT NULL,
 generation VARCHAR(128) NOT NULL, human_reopen_count INTEGER NOT NULL DEFAULT 0,
 resolved_source_revision VARCHAR(128), seen_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TIMESTAMPTZ, dismissed_at TIMESTAMPTZ,
 FOREIGN KEY(lane_id,user_id) REFERENCES attention_lanes(id,user_id), UNIQUE(user_id,source_key), UNIQUE(id,user_id),
 CHECK ((status='COMPLETED')=(completed_at IS NOT NULL)), CHECK ((status='DISMISSED')=(dismissed_at IS NOT NULL))
);
CREATE INDEX attention_items_stack_idx ON attention_items(user_id,status,stack_order,id);
CREATE INDEX attention_items_lane_idx ON attention_items(user_id,lane_id,status,lane_order,id);
CREATE INDEX attention_items_history_idx ON attention_items(user_id,status,updated_at DESC,id);
ALTER TABLE attention_items ENABLE ROW LEVEL SECURITY;
CREATE TABLE attention_operations (
 user_id UUID NOT NULL REFERENCES attention_queues(user_id), namespace VARCHAR(48) NOT NULL,
 operation_id UUID NOT NULL, request_hash CHAR(64) NOT NULL, response TEXT NOT NULL,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,namespace,operation_id)
);
ALTER TABLE attention_operations ENABLE ROW LEVEL SECURITY;
