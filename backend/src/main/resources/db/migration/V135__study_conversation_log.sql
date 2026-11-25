CREATE TABLE study_learning_session (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES auth.users(id),
    status text NOT NULL CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','CANCELLED')),
    source text NOT NULL CHECK (source IN ('CHATGPT_MCP','WEB','MANUAL')),
    started bigint NOT NULL,
    ended bigint CHECK (ended >= started),
    revision bigint NOT NULL DEFAULT 1,
    deleted boolean NOT NULL DEFAULT false,
    summary jsonb NOT NULL DEFAULT '{}',
    provenance text NOT NULL,
    original jsonb,
    effective_start bigint NOT NULL,
    effective_end bigint,
    UNIQUE(owner_id,id),
    CHECK ((ended IS NULL) = (status IN ('ACTIVE','PAUSED'))),
    CHECK (NOT deleted OR status='COMPLETED'),
    CHECK (effective_end >= effective_start)
);
CREATE UNIQUE INDEX study_learning_open ON study_learning_session(owner_id) WHERE ended IS NULL;
CREATE INDEX study_learning_span ON study_learning_session(owner_id,effective_start,id);
CREATE TABLE study_learning_day (
    owner_id uuid NOT NULL, session_id uuid NOT NULL, day date NOT NULL,
    seconds integer NOT NULL CHECK (seconds BETWEEN 0 AND 86400),
    PRIMARY KEY(owner_id,day,session_id),
    FOREIGN KEY(owner_id,session_id) REFERENCES study_learning_session(owner_id,id)
);
CREATE TABLE study_learning_operation (
    event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id uuid NOT NULL, session_id uuid NOT NULL, operation_key uuid NOT NULL,
    at_second bigint NOT NULL, action text NOT NULL, request_hash text NOT NULL,
    reason text, response jsonb NOT NULL,
    UNIQUE(owner_id,operation_key),
    FOREIGN KEY(owner_id,session_id) REFERENCES study_learning_session(owner_id,id)
);
CREATE INDEX study_learning_event_session ON study_learning_operation(owner_id,session_id,event_id);
CREATE TABLE study_learning_pause (
    owner_id uuid NOT NULL, session_id uuid NOT NULL, revision bigint NOT NULL,
    started bigint NOT NULL, ended bigint CHECK(ended >= started), PRIMARY KEY(session_id,revision),
    FOREIGN KEY(owner_id,session_id) REFERENCES study_learning_session(owner_id,id)
);
CREATE TABLE study_learning_checkpoint (
    owner_id uuid NOT NULL, session_id uuid NOT NULL, revision bigint NOT NULL,
    at_second bigint NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(session_id,revision),
    FOREIGN KEY(owner_id,session_id) REFERENCES study_learning_session(owner_id,id)
);
CREATE TABLE study_learning_binding (
    owner_id uuid NOT NULL, session_id uuid PRIMARY KEY, generation bigint NOT NULL DEFAULT 0,
    pending_device_hash text, challenge_hash text UNIQUE, challenge_until bigint, token_hash text UNIQUE,
    bound_at bigint, lease_until bigint, last_seq bigint NOT NULL DEFAULT 0, last_end bigint,
    FOREIGN KEY(owner_id,session_id) REFERENCES study_learning_session(owner_id,id)
);
CREATE TABLE study_learning_observation (
    owner_id uuid NOT NULL, session_id uuid NOT NULL, generation bigint NOT NULL,
    seq bigint NOT NULL CHECK(seq>0), started bigint NOT NULL, ended bigint NOT NULL,
    state text NOT NULL CHECK(state IN ('STUDYING','IDLE','AWAY')),
    CHECK(ended>started AND ended-started<=65),
    PRIMARY KEY(session_id,generation,seq),
    FOREIGN KEY(owner_id,session_id) REFERENCES study_learning_session(owner_id,id)
);
CREATE INDEX study_learning_observation_span ON study_learning_observation(owner_id,session_id,started);
ALTER TABLE study_learning_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_learning_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_learning_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_learning_pause ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_learning_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_learning_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_learning_observation ENABLE ROW LEVEL SECURITY;
