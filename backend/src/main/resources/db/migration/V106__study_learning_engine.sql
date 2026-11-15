-- Additive engine state. Existing workbooks/attempts and V104 checksums stay immutable.
CREATE TABLE study_engine_jobs (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES study_workspaces(owner_id),
 kind varchar(20) NOT NULL CHECK(kind IN ('PLAN','INDEX','GENERATE','COACH','RENDER')),
 job_key varchar(240) NOT NULL, state varchar(24) NOT NULL,
 input text NOT NULL, result text, receipt text NOT NULL DEFAULT '{}',
 attempts integer NOT NULL DEFAULT 0, manual_retries integer NOT NULL DEFAULT 0, checkpoint integer NOT NULL DEFAULT 0,
 lease_token uuid, lease_until timestamptz, worker_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,kind,job_key), UNIQUE(owner_id,id),
 CHECK(state IN ('QUEUED','RUNNING','PARTIAL','VALIDATING','READY','PUBLISHED','FAILED','BLOCKED','CANCELLED'))
);
CREATE INDEX study_engine_claim ON study_engine_jobs(kind,state,created_at);
CREATE TABLE study_source_excerpts (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, job_id uuid NOT NULL,
 material_id varchar(180) NOT NULL, material_version integer NOT NULL,
 asset_id uuid NOT NULL REFERENCES study_assets(id), source_hash varchar(64) NOT NULL,
 page_index integer NOT NULL CHECK(page_index>0), ordinal integer NOT NULL,
 page_label varchar(120), body text NOT NULL, quality varchar(30) NOT NULL,
 parser_version varchar(100) NOT NULL, UNIQUE(job_id,page_index,ordinal), UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,job_id) REFERENCES study_engine_jobs(owner_id,id),
 CHECK(quality IN ('usable','needs_source_check','textless'))
);
CREATE INDEX study_source_owner_material ON study_source_excerpts(owner_id,material_id,material_version,page_index,ordinal);
CREATE INDEX study_source_search ON study_source_excerpts USING gin(to_tsvector('simple',body));
CREATE TABLE study_engine_workers (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES study_workspaces(owner_id),
 token_hash varchar(64) NOT NULL UNIQUE, label varchar(120) NOT NULL,
 expires_at timestamptz NOT NULL, last_seen timestamptz, revoked boolean NOT NULL DEFAULT false
);
ALTER TABLE study_engine_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_source_excerpts ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_engine_workers ENABLE ROW LEVEL SECURITY;
CREATE TABLE study_engine_preferences (
 owner_id uuid PRIMARY KEY REFERENCES study_workspaces(owner_id), payload text NOT NULL
);
ALTER TABLE study_engine_preferences ENABLE ROW LEVEL SECURITY;
-- No PostgREST/browser policies: access is through the owner API or a scoped worker token.
