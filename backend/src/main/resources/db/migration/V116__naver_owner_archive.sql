-- Additive, private owner archive. No legacy LOG/NOTE/financial records modified.
CREATE TABLE naver_archive_workspaces (owner_id uuid PRIMARY KEY);
CREATE TABLE naver_archive_posts (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, external_post_id varchar(80), original_url varchar(1000),
 title varchar(500) NOT NULL, body_text text NOT NULL, source_html text, safe_html text NOT NULL,
 original_published_at timestamptz, source_category varchar(200), source_visibility varchar(20) NOT NULL,
 provenance varchar(20) NOT NULL, fidelity_status varchar(32) NOT NULL, source_sha256 char(64) NOT NULL,
 is_archived boolean NOT NULL DEFAULT false, version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id), CHECK(source_visibility IN ('PUBLIC','NEIGHBORS','PRIVATE','UNKNOWN')),
 CHECK(provenance IN ('OWNER_EXPORT','OWNER_PASTE','OWNER_WEB')),
 CHECK(fidelity_status IN ('COMPLETE_OWNER_SUPPLIED','NEEDS_REVIEW','INCOMPLETE','FAILED'))
);
CREATE UNIQUE INDEX naver_archive_external ON naver_archive_posts(owner_id,external_post_id) WHERE external_post_id IS NOT NULL;
CREATE UNIQUE INDEX naver_archive_url ON naver_archive_posts(owner_id,original_url) WHERE original_url IS NOT NULL;
CREATE INDEX naver_archive_order ON naver_archive_posts(owner_id,is_archived,original_published_at,id);
CREATE TABLE naver_archive_revisions (
 receipt uuid PRIMARY KEY, owner_id uuid NOT NULL, post_id uuid NOT NULL, version bigint NOT NULL,
 action varchar(20) NOT NULL, actor varchar(20) NOT NULL, source_sha256 char(64) NOT NULL,
 snapshot text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,post_id) REFERENCES naver_archive_posts(owner_id,id), UNIQUE(post_id,version)
);
CREATE TABLE naver_archive_operations (
 owner_id uuid NOT NULL, request_id uuid NOT NULL, fingerprint char(64) NOT NULL, result text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE naver_archive_read_progress (
 owner_id uuid NOT NULL, post_id uuid NOT NULL, is_read boolean NOT NULL DEFAULT false,
 position double precision NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,post_id),
 FOREIGN KEY(owner_id,post_id) REFERENCES naver_archive_posts(owner_id,id)
);
CREATE TABLE naver_archive_import_batches (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, manifest_sha256 char(64) NOT NULL, manifest text NOT NULL,
 state varchar(20) NOT NULL DEFAULT 'PREVIEW', created_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz, UNIQUE(owner_id,id), UNIQUE(owner_id,manifest_sha256)
);
CREATE TABLE naver_archive_import_items (
 batch_id uuid NOT NULL, owner_id uuid NOT NULL, item_index integer NOT NULL, candidate text NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'PENDING', post_id uuid, receipt uuid, error_code varchar(80),
 PRIMARY KEY(batch_id,item_index), FOREIGN KEY(owner_id,batch_id) REFERENCES naver_archive_import_batches(owner_id,id)
);
CREATE TABLE naver_archive_assets (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, post_id uuid NOT NULL, mime_type varchar(40) NOT NULL,
 bytes bytea NOT NULL, sha256 char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,post_id) REFERENCES naver_archive_posts(owner_id,id)
);
-- API owns authorization; prevent accidental exposure through direct PostgREST roles.
ALTER TABLE naver_archive_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_read_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_assets ENABLE ROW LEVEL SECURITY;
