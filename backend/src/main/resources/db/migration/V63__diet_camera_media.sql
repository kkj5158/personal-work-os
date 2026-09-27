-- V62 is already applied by MONEY; additive Camera metadata only.
CREATE TABLE diet_camera_media (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id),
 client_media_id UUID NOT NULL, captured_at TIMESTAMPTZ NOT NULL,
 offset_minutes INTEGER NOT NULL CHECK(offset_minutes BETWEEN -1080 AND 1080),
 captured_date DATE NOT NULL, image_ref UUID REFERENCES journal_media(id),
 image_sha256 VARCHAR(64) NOT NULL, memo TEXT CHECK(length(memo)<=4000),
 deleted_at TIMESTAMPTZ, revision BIGINT NOT NULL CHECK(revision>0),
 purge_requested BOOLEAN NOT NULL DEFAULT false, purged_at TIMESTAMPTZ,
 projection_pending BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(owner_id,client_media_id)
);
CREATE INDEX diet_camera_date ON diet_camera_media(owner_id,captured_date,captured_at,client_media_id);
ALTER TABLE diet_camera_media ENABLE ROW LEVEL SECURITY;
-- Rebuildable workspace-owned copies required by the existing NOTE media contract.
CREATE TABLE diet_camera_note_media (
 camera_id UUID NOT NULL REFERENCES diet_camera_media(id),
 workspace_id UUID NOT NULL REFERENCES note_workspaces(id) ON DELETE CASCADE,
 media_id UUID REFERENCES journal_media(id) ON DELETE SET NULL,
 PRIMARY KEY(camera_id,workspace_id)
);
ALTER TABLE diet_camera_note_media ENABLE ROW LEVEL SECURITY;
