-- Additive Shared Desk domain. Existing application tables/data are preserved.
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_shared_desk_owner ON projects(id,user_id);
CREATE TABLE shared_desk_sync_heads (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id), last_seq bigint NOT NULL DEFAULT 0 CHECK(last_seq>=0), download_bytes_estimate bigint NOT NULL DEFAULT 0,
 retention_floor bigint NOT NULL DEFAULT 0 CHECK(retention_floor>=0)
);
CREATE TABLE shared_desk_items (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES auth.users(id), kind varchar(8) NOT NULL CHECK(kind IN ('CLIP','MEMO','FILE')),
 project_id uuid, title text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', pinned boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT current_timestamp,
 updated_at timestamptz NOT NULL DEFAULT current_timestamp, deleted_at timestamptz,
 UNIQUE(id,owner_id), UNIQUE(id,owner_id,kind),
 CHECK(octet_length(body)<=1048576), CHECK(length(title)<=240), CHECK(kind='FILE' OR length(body)>0),
 FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,user_id) ON DELETE SET NULL (project_id)
);
CREATE INDEX idx_shared_desk_owner ON shared_desk_items(owner_id,kind,updated_at DESC,id);
CREATE TABLE shared_desk_files (
 item_id uuid PRIMARY KEY, owner_id uuid NOT NULL, kind varchar(8) NOT NULL DEFAULT 'FILE' CHECK(kind='FILE'),
 display_name varchar(240) NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 0 AND 104857600),
 sha256 varchar(64) NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), claimed_mime varchar(100) NOT NULL,
 detected_mime varchar(100), state varchar(16) NOT NULL CHECK(state IN ('UPLOADING','VERIFYING','READY','FAILED','CANCELLED','PURGED')),
 staging_key text NOT NULL UNIQUE, final_key text UNIQUE, ticket_id uuid NOT NULL, upload_expires_at timestamptz NOT NULL,
 verified_at timestamptz, failure_code varchar(40), verification_operation uuid, verification_started_at timestamptz,
 FOREIGN KEY(item_id,owner_id,kind) REFERENCES shared_desk_items(id,owner_id,kind), UNIQUE(item_id,owner_id)
);
CREATE TABLE shared_desk_replies (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, parent_id uuid NOT NULL, parent_kind varchar(8) NOT NULL DEFAULT 'MEMO' CHECK(parent_kind='MEMO'),
 body text NOT NULL CHECK(length(body)>0 AND octet_length(body)<=1048576), revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT current_timestamp, updated_at timestamptz NOT NULL DEFAULT current_timestamp, change_seq bigint NOT NULL DEFAULT 0,
 FOREIGN KEY(parent_id,owner_id,parent_kind) REFERENCES shared_desk_items(id,owner_id,kind)
);
CREATE INDEX idx_shared_desk_replies ON shared_desk_replies(owner_id,parent_id,created_at,id);
CREATE TABLE shared_desk_memo_files (
 owner_id uuid NOT NULL,memo_id uuid NOT NULL,file_id uuid NOT NULL,memo_kind varchar(8) NOT NULL DEFAULT 'MEMO' CHECK(memo_kind='MEMO'),
 PRIMARY KEY(owner_id,memo_id,file_id),
 FOREIGN KEY(memo_id,owner_id,memo_kind) REFERENCES shared_desk_items(id,owner_id,kind),
 FOREIGN KEY(file_id,owner_id) REFERENCES shared_desk_files(item_id,owner_id)
);
CREATE TABLE shared_desk_operations (
 owner_id uuid NOT NULL REFERENCES auth.users(id), operation_id uuid NOT NULL, request_hash varchar(64) NOT NULL,
 action varchar(120) NOT NULL, result text, created_at timestamptz NOT NULL DEFAULT current_timestamp,
 expires_at timestamptz NOT NULL DEFAULT current_timestamp+interval '30 days',
 PRIMARY KEY(owner_id,operation_id)
);
-- Expired operation IDs/hashes remain as compact denial records: never replay an old create.
CREATE TABLE shared_desk_changes (
 owner_id uuid NOT NULL REFERENCES auth.users(id), seq bigint NOT NULL, entity_id uuid NOT NULL,
 entity_kind varchar(8) NOT NULL, action varchar(8) NOT NULL, revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT current_timestamp, PRIMARY KEY(owner_id,seq)
);
-- Immutable per-mutation snapshots make list pagination stable across edits/deletes.
CREATE TABLE shared_desk_item_versions (
 owner_id uuid NOT NULL, item_id uuid NOT NULL, seq bigint NOT NULL, kind varchar(8) NOT NULL,
 project_id uuid, title text NOT NULL, body text NOT NULL, pinned boolean NOT NULL,
 revision bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
 file_summary text, PRIMARY KEY(owner_id,item_id,seq)
);
CREATE INDEX idx_shared_desk_versions_seq ON shared_desk_item_versions(owner_id,seq);
CREATE TABLE shared_desk_cursors (
 token uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES auth.users(id),environment varchar(16) NOT NULL,
 purpose varchar(8) NOT NULL,scope_hash varchar(64) NOT NULL,high_water bigint NOT NULL,position bigint NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX idx_shared_desk_cursors_expiry ON shared_desk_cursors(expires_at);
CREATE TABLE shared_desk_object_cleanup (
 owner_id uuid NOT NULL,object_key text PRIMARY KEY,not_before timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0
);
-- Keep issued staging URLs charged to the owner until their individual object deletion is acknowledged.
-- A cancel/failure does not invalidate an already issued presigned PUT URL.
CREATE TABLE shared_desk_upload_reservations (
 owner_id uuid NOT NULL REFERENCES auth.users(id),staging_key text PRIMARY KEY,
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 104857600),expires_at timestamptz NOT NULL
);
CREATE INDEX idx_shared_desk_upload_reservation_expiry ON shared_desk_upload_reservations(expires_at);
