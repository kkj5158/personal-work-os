-- Only transient bytes from the authenticated archive upload protocol.
CREATE TABLE naver_archive_native_upload_parts (
 owner_id uuid NOT NULL REFERENCES naver_archive_workspaces(owner_id),
 archive_sha256 char(64) NOT NULL CHECK (archive_sha256 ~ '^[a-f0-9]{64}$'),
 part_index integer NOT NULL CHECK (part_index BETWEEN 0 AND 31),
 total_bytes integer NOT NULL CHECK (total_bytes BETWEEN 1 AND 24000000),
 bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 750000),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id, part_index)
);
ALTER TABLE naver_archive_native_upload_parts ENABLE ROW LEVEL SECURITY;
