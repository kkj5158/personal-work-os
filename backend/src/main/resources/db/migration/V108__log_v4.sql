-- LOG is separate from all existing POS content. No seed/import or existing-row changes.
CREATE TABLE log_workspaces (
 owner_id uuid PRIMARY KEY, active_profile_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE log_profiles (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES log_workspaces(owner_id),
 name varchar(40) NOT NULL, handle varchar(32) NOT NULL, bio varchar(300) NOT NULL DEFAULT '',
 avatar_id uuid, revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, UNIQUE(owner_id,id)
);
CREATE UNIQUE INDEX log_profile_handle ON log_profiles(owner_id,lower(handle));
ALTER TABLE log_workspaces ADD CONSTRAINT log_active_profile FOREIGN KEY(owner_id,active_profile_id) REFERENCES log_profiles(owner_id,id);
CREATE TABLE log_images (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, profile_id uuid NOT NULL,
 display_name varchar(180) NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 18874368),
 sha256 varchar(64) NOT NULL, mime varchar(30) NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 staging_key text NOT NULL, final_key text NOT NULL, state varchar(20) NOT NULL CHECK(state IN ('UPLOADING','READY','FAILED')),
 created_at timestamptz NOT NULL DEFAULT now(), staging_cleaned boolean NOT NULL DEFAULT false, UNIQUE(owner_id,profile_id,id),
 FOREIGN KEY(owner_id,profile_id) REFERENCES log_profiles(owner_id,id)
);
ALTER TABLE log_profiles ADD CONSTRAINT log_avatar_scope FOREIGN KEY(owner_id,id,avatar_id) REFERENCES log_images(owner_id,profile_id,id);
CREATE TABLE log_posts (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, profile_id uuid NOT NULL,
 text text NOT NULL CHECK(length(text)<=50000), revision bigint NOT NULL DEFAULT 1,
 liked boolean NOT NULL DEFAULT false, saved boolean NOT NULL DEFAULT false,
 pinned boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false, reposted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
 legacy_key varchar(180), UNIQUE(owner_id,profile_id,id), UNIQUE(owner_id,profile_id,legacy_key),
 FOREIGN KEY(owner_id,profile_id) REFERENCES log_profiles(owner_id,id)
);
CREATE INDEX log_feed ON log_posts(owner_id,profile_id,pinned DESC,created_at DESC,id);
CREATE TABLE log_post_images (
 owner_id uuid NOT NULL, profile_id uuid NOT NULL, post_id uuid NOT NULL, image_id uuid NOT NULL,
 position smallint NOT NULL CHECK(position BETWEEN 0 AND 3), PRIMARY KEY(post_id,position), UNIQUE(post_id,image_id),
 FOREIGN KEY(owner_id,profile_id,post_id) REFERENCES log_posts(owner_id,profile_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,profile_id,image_id) REFERENCES log_images(owner_id,profile_id,id)
);
CREATE TABLE log_replies (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, profile_id uuid NOT NULL, post_id uuid NOT NULL,
 text text NOT NULL CHECK(length(text) BETWEEN 1 AND 3000), revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
 FOREIGN KEY(owner_id,profile_id,post_id) REFERENCES log_posts(owner_id,profile_id,id) ON DELETE CASCADE
);
CREATE INDEX log_reply_post ON log_replies(owner_id,profile_id,post_id,created_at,id);
CREATE TABLE log_drafts (
 owner_id uuid NOT NULL, profile_id uuid PRIMARY KEY, text text NOT NULL DEFAULT '' CHECK(length(text)<=50000),
 revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,profile_id) REFERENCES log_profiles(owner_id,id)
);
CREATE TABLE log_draft_images (
 owner_id uuid NOT NULL, profile_id uuid NOT NULL REFERENCES log_drafts(profile_id) ON DELETE CASCADE,
 image_id uuid NOT NULL, position smallint NOT NULL CHECK(position BETWEEN 0 AND 3), PRIMARY KEY(profile_id,position),
 UNIQUE(profile_id,image_id), FOREIGN KEY(owner_id,profile_id,image_id) REFERENCES log_images(owner_id,profile_id,id)
);
-- Browser database roles have no direct access, including deployments with a PostgREST gateway.
ALTER TABLE log_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_draft_images ENABLE ROW LEVEL SECURITY;
