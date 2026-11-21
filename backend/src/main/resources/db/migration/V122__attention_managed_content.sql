-- Managed Codex grants and append-only report revisions. Existing items and journals are untouched.
CREATE TABLE attention_content_targets (
    item_id UUID PRIMARY KEY REFERENCES attention_items(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    logical_task_id UUID NOT NULL,
    run_id UUID NOT NULL,
    environment VARCHAR(4) NOT NULL CHECK (environment IN ('DEV','PROD')),
    source_key VARCHAR(64) NOT NULL,
    generation UUID NOT NULL,
    create_receipt UUID NOT NULL UNIQUE,
    reserve_hash VARCHAR(64) NOT NULL,
    approved_title VARCHAR(100) NOT NULL,
    approved_request TEXT NOT NULL,
    public_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    UNIQUE (user_id, environment, logical_task_id),
    UNIQUE (user_id, environment, run_id),
    UNIQUE (item_id, user_id)
);

CREATE TABLE attention_content_reports (
    item_id UUID NOT NULL,
    user_id UUID NOT NULL,
    content_revision INTEGER NOT NULL CHECK (content_revision > 0),
    report_id UUID NOT NULL,
    report_revision INTEGER NOT NULL CHECK (report_revision > 0),
    operation_id UUID NOT NULL,
    body_hash VARCHAR(64) NOT NULL,
    session_id UUID,
    turn_id VARCHAR(100) NOT NULL,
    event_id VARCHAR(40) NOT NULL,
    content JSONB NOT NULL,
    preview JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (item_id, user_id) REFERENCES attention_content_targets(item_id,user_id),
    PRIMARY KEY (item_id, content_revision),
    UNIQUE (user_id, operation_id),
    UNIQUE (item_id, report_revision)
);

CREATE TABLE attention_content_heads (
    item_id UUID PRIMARY KEY,
    content_revision INTEGER NOT NULL,
    FOREIGN KEY (item_id, content_revision) REFERENCES attention_content_reports(item_id,content_revision)
);

ALTER TABLE attention_content_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_content_heads ENABLE ROW LEVEL SECURITY;


-- Receipts can only be inserted through independently authenticated verification.
CREATE TABLE attention_content_verifications (
    receipt_id UUID PRIMARY KEY,
    item_id UUID NOT NULL,
    content_revision INTEGER NOT NULL,
    evidence_id VARCHAR(32) NOT NULL,
    result VARCHAR(8) NOT NULL CHECK (result IN ('PASSED','FAILED','EXISTS')),
    body_hash VARCHAR(64) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (item_id, content_revision) REFERENCES attention_content_reports(item_id,content_revision),
    UNIQUE (item_id, content_revision, evidence_id)
);
ALTER TABLE attention_content_verifications ENABLE ROW LEVEL SECURITY;
